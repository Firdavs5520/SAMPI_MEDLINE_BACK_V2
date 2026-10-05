const CashierSettings = require("../models/CashierSettings");
const AppError = require("../utils/AppError");

const TASHKENT_UTC_OFFSET_HOURS = 5;
const DEFAULT_SETTINGS = {
  key: "default",
  shiftStartTime: "08:00",
  shiftEndTime: "02:00",
  lateEntryWarningMinutes: 30,
  requireDebtPhone: true
};

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const assertReadPermission = (user) => {
  if (!user || !["cashier", "manager"].includes(user.role)) {
    throw new AppError("Bu rol uchun ruxsat yo'q", 403);
  }
};

const assertWritePermission = (user) => {
  if (!user || user.role !== "cashier") {
    throw new AppError("Kassa sozlamalarini faqat kassir o'zgartira oladi", 403);
  }
};

const normalizeTime = (value, fieldLabel) => {
  const safe = String(value || "").trim();
  const match = TIME_PATTERN.exec(safe);
  if (!match) {
    throw new AppError(`${fieldLabel} HH:mm formatida bo'lishi kerak`, 400);
  }
  return `${match[1]}:${match[2]}`;
};

const parseTime = (value) => {
  const [hour, minute] = normalizeTime(value, "Vaqt").split(":").map(Number);
  return { hour, minute };
};

const normalizeLateEntryWarningMinutes = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 720) {
    throw new AppError("Kechikkan yozuv ogohlantirishi 0-720 daqiqa orasida bo'lishi kerak", 400);
  }
  return Math.round(parsed);
};

const serializeSettings = (settings) => ({
  currentShiftDate: getCurrentShiftDateFromSettings(settings),
  shiftStartTime: settings.shiftStartTime,
  shiftEndTime: settings.shiftEndTime,
  lateEntryWarningMinutes: Number(settings.lateEntryWarningMinutes || 0),
  requireDebtPhone: Boolean(settings.requireDebtPhone),
  updatedAt: settings.updatedAt || null,
  updatedBy: settings.updatedBy || null
});

const getOrCreateSettingsDoc = async () => {
  const existing = await CashierSettings.findOne({ key: DEFAULT_SETTINGS.key });
  if (existing) return existing;

  try {
    return await CashierSettings.create(DEFAULT_SETTINGS);
  } catch (error) {
    if (error?.code === 11000) {
      return CashierSettings.findOne({ key: DEFAULT_SETTINGS.key });
    }
    throw error;
  }
};

// Smena vaqtlari kam o'zgaradi: navbat va kassa so'rovlarida bazaga har safar borilmasin.
// O'zgartirilganda kesh darhol tozalanadi.
const SETTINGS_CACHE_MS = 30 * 1000;
let settingsCache = { at: 0, value: null };

const getCachedSettings = async () => {
  if (settingsCache.value && Date.now() - settingsCache.at < SETTINGS_CACHE_MS) {
    return settingsCache.value;
  }
  const doc = await getOrCreateSettingsDoc();
  const value = typeof doc?.toObject === "function" ? doc.toObject() : doc;
  settingsCache = { at: Date.now(), value };
  return value;
};

const clearSettingsCache = () => {
  settingsCache = { at: 0, value: null };
};

const getSettings = async ({ user } = {}) => {
  if (user) {
    assertReadPermission(user);
  }
  const settings = await getOrCreateSettingsDoc();
  return serializeSettings(settings);
};

const updateSettings = async ({ payload = {}, user }) => {
  assertWritePermission(user);

  const current = await getOrCreateSettingsDoc();
  const next = {
    shiftStartTime:
      payload.shiftStartTime === undefined
        ? current.shiftStartTime
        : normalizeTime(payload.shiftStartTime, "Smena boshlanishi"),
    shiftEndTime:
      payload.shiftEndTime === undefined
        ? current.shiftEndTime
        : normalizeTime(payload.shiftEndTime, "Smena tugashi"),
    lateEntryWarningMinutes:
      payload.lateEntryWarningMinutes === undefined
        ? current.lateEntryWarningMinutes
        : normalizeLateEntryWarningMinutes(payload.lateEntryWarningMinutes),
    requireDebtPhone:
      payload.requireDebtPhone === undefined
        ? Boolean(current.requireDebtPhone)
        : Boolean(payload.requireDebtPhone)
  };

  current.shiftStartTime = next.shiftStartTime;
  current.shiftEndTime = next.shiftEndTime;
  current.lateEntryWarningMinutes = next.lateEntryWarningMinutes;
  current.requireDebtPhone = next.requireDebtPhone;
  current.updatedBy = {
    userId: user._id,
    name: user.name,
    role: user.role
  };

  await current.save();
  clearSettingsCache();
  return serializeSettings(current);
};

const toUtcDateFromTashkent = (
  year,
  month,
  day,
  hour = 0,
  minute = 0,
  second = 0,
  ms = 0
) =>
  new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      hour - TASHKENT_UTC_OFFSET_HOURS,
      minute,
      second,
      ms
    )
  );

const getShiftBounds = ({ dateParts, settings }) => {
  const { year, month, day } = dateParts;
  const startTime = parseTime(settings.shiftStartTime || DEFAULT_SETTINGS.shiftStartTime);
  const endTime = parseTime(settings.shiftEndTime || DEFAULT_SETTINGS.shiftEndTime);
  const start = toUtcDateFromTashkent(year, month, day, startTime.hour, startTime.minute, 0, 0);
  const shiftEndsNextDay =
    endTime.hour < startTime.hour ||
    (endTime.hour === startTime.hour && endTime.minute <= startTime.minute);
  const endBoundary = toUtcDateFromTashkent(
    year,
    month,
    shiftEndsNextDay ? day + 1 : day,
    endTime.hour,
    endTime.minute,
    0,
    0
  );

  return { start, end: new Date(endBoundary.getTime() - 1) };
};

const getShiftRangeFromSettings = ({ dateParts, dateString, settings }) => {
  const { start, end } = getShiftBounds({ dateParts, settings });

  return {
    safeDateString: dateString,
    start,
    end,
    fromLabel: settings.shiftStartTime || DEFAULT_SETTINGS.shiftStartTime,
    toLabel: settings.shiftEndTime || DEFAULT_SETTINGS.shiftEndTime,
    settings: serializeSettings(settings)
  };
};

const getShiftRange = async ({ dateString, dateParts }) => {
  const settings = await getCachedSettings();
  return getShiftRangeFromSettings({ dateParts, dateString, settings });
};

const toTashkentDateString = (date) =>
  new Date(date.getTime() + TASHKENT_UTC_OFFSET_HOURS * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

const shiftDateString = (dateString, days) => {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
};

const toDateParts = (dateString) => {
  const [year, month, day] = dateString.split("-").map(Number);
  return { year, month, day };
};

// Smena yarim tundan o'tishi mumkin (masalan 08:00 - 02:00). Shu sababli "bugun"
// kalendar sanasi emas, hozir davom etayotgan smena boshlangan sana hisoblanadi.
const getCurrentShiftDateFromSettings = (settings, now = new Date()) => {
  const calendarDate = toTashkentDateString(now);
  const previousDate = shiftDateString(calendarDate, -1);
  const previousShift = getShiftBounds({
    dateParts: toDateParts(previousDate),
    settings
  });

  return now.getTime() <= previousShift.end.getTime() ? previousDate : calendarDate;
};

const getCurrentShiftDate = async (now = new Date()) => {
  const settings = await getCachedSettings();
  return getCurrentShiftDateFromSettings(settings, now);
};

module.exports = {
  DEFAULT_SETTINGS,
  getSettings,
  updateSettings,
  getShiftRange,
  getCurrentShiftDate,
  shiftDateString,
  clearSettingsCache
};
