const lorQueueService = require("./lorQueueService");
const { subscribeLorQueueChanges } = require("./lorQueueEvents");
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

const writeSseEvent = (res, eventName, data) => {
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
};

const streamLorQueue = async ({
  req,
  res,
  date,
  lorIdentity = "lor1",
  limit = DEFAULT_LIMIT
} = {}) => {
  const safeLimit = normalizeLimit(limit);
  const normalizedLorIdentity = lorQueueService.normalizeLorIdentity(lorIdentity);
  let closed = false;

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  res.write("retry: 2500\n\n");

  const sendSnapshot = async (eventName = "queue") => {
    if (closed || res.destroyed || res.writableEnded) return;

    try {
      const data = await getLorQueue({
        date,
        lorIdentity: normalizedLorIdentity,
        limit: safeLimit
      });
      writeSseEvent(res, eventName, data);
    } catch (error) {
      writeSseEvent(res, "stream-error", {
        message: error?.message || "TV navbatini yuborib bo'lmadi"
      });
    }
  };

  await sendSnapshot("snapshot");

  const unsubscribe = subscribeLorQueueChanges((event) => {
    if (event?.lorIdentity && event.lorIdentity !== normalizedLorIdentity) return;
    if (date && event?.shiftDate && event.shiftDate !== date) return;
    sendSnapshot("queue");
  });

  const heartbeat = setInterval(() => {
    if (!closed && !res.destroyed && !res.writableEnded) {
      res.write(": heartbeat\n\n");
    }
  }, 25000);

  req.on("close", () => {
    closed = true;
    clearInterval(heartbeat);
    unsubscribe();
  });
};

module.exports = {
  setLorCurrentPatient,
  getLorQueue,
  streamLorQueue
};
