const lorQueueService = require("./lorQueueService");
const AppError = require("../utils/AppError");

const DEFAULT_LIMIT = 16;
const MAX_LIMIT = 40;

const normalizeLimit = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(parsed)));
};

const setLorCurrentPatient = async () => {
  throw new AppError(
    "TV navbat raqami kassir chiqargan LOR navbati orqali chaqiriladi",
    400
  );
};

const getLorQueue = async ({ date, lorIdentity = "lor1", limit = DEFAULT_LIMIT } = {}) => {
  const safeLimit = normalizeLimit(limit);
  const { safeDateString, shift, now, current } =
    await lorQueueService.getCurrentTicketForTv({
      date,
      lorIdentity
    });
  const lastChangedAt = current?.calledAt || null;

  return {
    date: safeDateString,
    generatedAt: now.toISOString(),
    lastChangedAt,
    announcementKey: current ? `${current.id}:${current.calledAt || ""}` : "",
    totalActive: current ? 1 : 0,
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
