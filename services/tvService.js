const LorCurrentPatient = require("../models/LorCurrentPatient");
const cashierSettingsService = require("./cashierSettingsService");
const AppError = require("../utils/AppError");

const TASHKENT_UTC_OFFSET_HOURS = 5;
const LOR_IDENTITIES = ["lor1"];
const DEFAULT_LIMIT = 16;
const MAX_LIMIT = 40;

const toTashkentDateString = (date = new Date()) =>
  new Date(date.getTime() + TASHKENT_UTC_OFFSET_HOURS * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

const normalizeDateString = (value) => {
  const safe = String(value || "").trim();
  if (!safe) return toTashkentDateString(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(safe)) {
    throw new AppError("Sana YYYY-MM-DD formatida bo'lishi kerak", 400);
  }
  return safe;
};

const parseDateParts = (dateString) => {
  const [yearPart, monthPart, dayPart] = String(dateString).split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new AppError("Sana noto'g'ri", 400);
  }

  return { year, month, day };
};

const normalizeLorIdentityFilter = (value) => {
  const safe = String(value || "all").trim().toLowerCase();
  if (!safe || safe === "all") return "all";
  if (!LOR_IDENTITIES.includes(safe)) {
    throw new AppError("TV navbat faqat faol LOR uchun ishlaydi", 400);
  }
  return safe;
};

const normalizeLimit = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(parsed)));
};

const normalizePatient = (patient) => {
  const firstName = String(patient?.firstName || "").trim();
  const lastName = String(patient?.lastName || "").trim();

  if (!firstName || !lastName) {
    throw new AppError("Bemorning ismi va familiyasi majburiy", 400);
  }

  return {
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`.trim()
  };
};

const normalizeDoctorName = (value) => {
  const safe = String(value || "").trim();
  if (!safe) {
    throw new AppError("Doktor nomi majburiy", 400);
  }
  return safe;
};

const createQueueCode = async ({ start, end }) => {
  const count = await LorCurrentPatient.countDocuments({
    acceptedAt: { $gte: start, $lte: end }
  });

  return `N-${String(count + 1).padStart(3, "0")}`;
};

const toIso = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
};

const getMinutesSince = (value, now = new Date()) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 0;
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60000));
};

const serializeCurrentPatient = (row, now) => ({
  id: String(row._id),
  queueCode: String(row.queueCode || "").trim(),
  doctorLabel: String(row?.doctor?.name || "").trim() || "LOR",
  acceptedAt: toIso(row.acceptedAt || row.createdAt),
  createdAt: toIso(row.createdAt),
  minutesSinceAccepted: getMinutesSince(row.acceptedAt || row.createdAt, now)
});

const getTodayShiftRange = async (date) => {
  const safeDateString = normalizeDateString(date);
  const shift = await cashierSettingsService.getShiftRange({
    dateString: safeDateString,
    dateParts: parseDateParts(safeDateString)
  });

  return { safeDateString, shift };
};

const setLorCurrentPatient = async ({
  user,
  patient,
  lorIdentity = "lor1",
  specialistId,
  specialistName
}) => {
  if (!user || user.role !== "lor") {
    throw new AppError("Bu amal faqat LOR uchun", 403);
  }

  const normalizedLorIdentity = normalizeLorIdentityFilter(lorIdentity);
  if (normalizedLorIdentity === "all") {
    throw new AppError("LOR tanlovi majburiy", 400);
  }

  const normalizedPatient = normalizePatient(patient);
  const doctorName = normalizeDoctorName(specialistName);
  const { shift } = await getTodayShiftRange();
  const queueCode = await createQueueCode({
    start: shift.start,
    end: shift.end
  });

  const row = await LorCurrentPatient.create({
    queueCode,
    lorIdentity: normalizedLorIdentity,
    patient: normalizedPatient,
    doctor: {
      ...(specialistId ? { specialistId } : {}),
      name: doctorName
    },
    acceptedBy: {
      userId: user._id,
      name: user.name,
      role: user.role
    },
    acceptedAt: new Date()
  });

  return serializeCurrentPatient(row, new Date());
};

const getLorQueue = async ({ date, lorIdentity = "all", limit = DEFAULT_LIMIT } = {}) => {
  const { safeDateString, shift } = await getTodayShiftRange(date);
  const safeLorIdentity = normalizeLorIdentityFilter(lorIdentity);
  const safeLimit = normalizeLimit(limit);
  const now = new Date();
  const filter = {
    lorIdentity: "lor1",
    acceptedAt: { $gte: shift.start, $lte: shift.end }
  };

  if (safeLorIdentity !== "all") {
    filter.lorIdentity = safeLorIdentity;
  }

  const [currentRow, totalActive] = await Promise.all([
    LorCurrentPatient.findOne(filter).sort({ acceptedAt: -1, createdAt: -1 }).lean(),
    LorCurrentPatient.countDocuments(filter)
  ]);
  const current = currentRow ? serializeCurrentPatient(currentRow, now) : null;
  const lastChangedAt = current?.acceptedAt || null;

  return {
    date: safeDateString,
    generatedAt: now.toISOString(),
    lastChangedAt,
    announcementKey: current ? `${current.id}:${current.acceptedAt || ""}:${lastChangedAt || ""}` : "",
    totalActive,
    limit: safeLimit,
    shift: {
      start: shift.start.toISOString(),
      end: shift.end.toISOString(),
      fromLabel: shift.fromLabel,
      toLabel: shift.toLabel
    },
    current,
    entries: current ? [current].slice(0, safeLimit) : []
  };
};

module.exports = {
  setLorCurrentPatient,
  getLorQueue
};
