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

const getShiftRangeFromSettings = ({ dateParts, dateString, settings }) => {
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

  return {
    safeDateString: dateString,
    start,
    end: new Date(endBoundary.getTime() - 1),
    fromLabel: settings.shiftStartTime || DEFAULT_SETTINGS.shiftStartTime,
    toLabel: settings.shiftEndTime || DEFAULT_SETTINGS.shiftEndTime,
    settings: serializeSettings(settings)
  };
};

const getShiftRange = async ({ dateString, dateParts }) => {
  const settings = await getOrCreateSettingsDoc();
  return getShiftRangeFromSettings({ dateParts, dateString, settings });
};

module.exports = {
  DEFAULT_SETTINGS,
  getSettings,
  updateSettings,
  getShiftRange
};
