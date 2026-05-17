const mongoose = require("mongoose");
const os = require("os");
const SystemEvent = require("../models/SystemEvent");

const BOOT_AT = new Date();

const getDbStateLabel = () => {
  const state = mongoose.connection.readyState;

  switch (state) {
    case 1:
      return "connected";
    case 2:
      return "connecting";
    case 3:
      return "disconnecting";
    default:
      return "disconnected";
  }
};

const recordStartupEvent = async ({ port }) => {
  try {
    await SystemEvent.create({
      eventType: "startup",
      level: "info",
      message: "Server ishga tushdi",
      meta: {
        node: process.version,
        port: Number(port),
        pid: process.pid
      }
    });
  } catch (_) {
    // Monitoring yozuvi uchun app ishini to'xtatmaymiz.
  }
};

const record5xxEvent = async ({ req, statusCode, message }) => {
  try {
    await SystemEvent.create({
      eventType: "error_5xx",
      level: "error",
      message: String(message || "Server ichki xatoligi"),
      meta: {
        statusCode,
        method: req?.method || "-",
        path: req?.originalUrl || req?.url || "-",
        userAgent: req?.headers?.["user-agent"] || "",
        ip: req?.ip || req?.socket?.remoteAddress || ""
      }
    });
  } catch (_) {
    // ignore
  }
};

const getHealthPayload = () => ({
  success: true,
  message: "Sampi Medline API ishlayapti",
  now: new Date().toISOString(),
  uptimeSec: Math.floor(process.uptime()),
  startedAt: BOOT_AT.toISOString(),
  dbState: getDbStateLabel()
});

const getMonitoringOverview = async () => {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [fiveXx24h, restartCount7d, recentErrors, recentStartups] = await Promise.all([
    SystemEvent.countDocuments({
      eventType: "error_5xx",
      createdAt: { $gte: since24h }
    }),
    SystemEvent.countDocuments({
      eventType: "startup",
      createdAt: { $gte: since7d }
    }),
    SystemEvent.find({ eventType: "error_5xx" })
      .sort({ createdAt: -1 })
      .limit(15)
      .lean(),
    SystemEvent.find({ eventType: "startup" })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean()
  ]);

  return {
    health: getHealthPayload(),
    system: {
      platform: os.platform(),
      nodeVersion: process.version,
      memory: process.memoryUsage()
    },
    metrics: {
      errors5xxLast24h: fiveXx24h,
      restartCountLast7d: restartCount7d
    },
    recentErrors,
    recentStartups
  };
};

module.exports = {
  getHealthPayload,
  getMonitoringOverview,
  recordStartupEvent,
  record5xxEvent
};
