const CashierEntry = require("../models/CashierEntry");
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

const getRoomLabel = (identity) => {
  return "LOR";
};

const getQueueCode = (entry, index) => {
  const raw = String(entry?.checkCode || entry?._id || "").replace(/[^a-zA-Z0-9]/g, "");
  const suffix = (raw.slice(-4) || String(index + 1).padStart(4, "0")).toUpperCase();
  return `N-${suffix}`;
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

const serializeEntry = (entry, index, roomIndex, now) => ({
  id: String(entry._id),
  queueCode: getQueueCode(entry, index),
  roomId: entry.checkLorIdentity || "lor",
  roomLabel: getRoomLabel(entry.checkLorIdentity),
  doctorLabel: String(entry.specialistName || "").trim() || getRoomLabel(entry.checkLorIdentity),
  acceptedAt: toIso(entry.entryDate || entry.createdAt),
  createdAt: toIso(entry.createdAt),
  minutesSinceAccepted: getMinutesSince(entry.entryDate || entry.createdAt, now),
  position: index + 1,
  roomPosition: roomIndex + 1
});

const getLatestTimestamp = (entries) => {
  const latest = entries.reduce((max, entry) => {
    const candidates = [entry.entryDate, entry.createdAt, entry.updatedAt]
      .map((value) => (value ? new Date(value).getTime() : 0))
      .filter(Number.isFinite);
    return Math.max(max, ...candidates);
  }, 0);

  return latest ? new Date(latest).toISOString() : null;
};

const getLorQueue = async ({ date, lorIdentity = "all", limit = DEFAULT_LIMIT } = {}) => {
  const safeDateString = normalizeDateString(date);
  const safeLorIdentity = normalizeLorIdentityFilter(lorIdentity);
  const safeLimit = normalizeLimit(limit);
  const now = new Date();
  const shift = await cashierSettingsService.getShiftRange({
    dateString: safeDateString,
    dateParts: parseDateParts(safeDateString)
  });
  const filter = {
    department: "lor",
    specialistType: "lor",
    checkLorIdentity: "lor1",
    entryDate: { $gte: shift.start, $lte: shift.end }
  };

  if (safeLorIdentity !== "all") {
    filter.checkLorIdentity = safeLorIdentity;
  }

  const entries = await CashierEntry.find(filter)
    .select("checkCode checkLorIdentity specialistName entryDate createdAt updatedAt")
    .sort({ entryDate: 1, createdAt: 1 })
    .lean();

  const roomPositions = new Map();
  const serializedAscending = entries.map((entry, index) => {
    const roomId = entry.checkLorIdentity || "lor";
    const currentRoomIndex = roomPositions.get(roomId) || 0;
    roomPositions.set(roomId, currentRoomIndex + 1);
    return serializeEntry(entry, index, currentRoomIndex, now);
  });
  const newestFirst = [...serializedAscending].reverse();
  const roomMap = new Map();

  for (const row of newestFirst) {
    const roomId = row.roomId;
    if (!roomMap.has(roomId)) {
      roomMap.set(roomId, {
        id: roomId,
        label: row.roomLabel,
        current: null,
        recent: [],
        total: 0
      });
    }

    const room = roomMap.get(roomId);
    room.total += 1;
    if (!room.current) {
      room.current = row;
    } else {
      room.recent.push(row);
    }
  }

  const rooms = LOR_IDENTITIES.map((identity) => {
    const existing = roomMap.get(identity);
    return (
      existing || {
        id: identity,
        label: getRoomLabel(identity),
        current: null,
        recent: [],
        total: 0
      }
    );
  }).filter((room) => safeLorIdentity === "all" || room.id === safeLorIdentity);

  const unknownRoom = roomMap.get("lor");
  if (unknownRoom && safeLorIdentity === "all") {
    rooms.push(unknownRoom);
  }

  const current = newestFirst[0] || null;
  const lastChangedAt = getLatestTimestamp(entries);

  return {
    date: safeDateString,
    generatedAt: now.toISOString(),
    lastChangedAt,
    announcementKey: current ? `${current.id}:${current.acceptedAt || ""}:${lastChangedAt || ""}` : "",
    totalActive: entries.length,
    limit: safeLimit,
    shift: {
      start: shift.start.toISOString(),
      end: shift.end.toISOString(),
      fromLabel: shift.fromLabel,
      toLabel: shift.toLabel
    },
    current,
    rooms,
    entries: newestFirst.slice(0, safeLimit)
  };
};

module.exports = {
  getLorQueue
};
