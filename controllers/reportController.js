const asyncHandler = require("../utils/asyncHandler");
const reportService = require("../services/reportService");
const AppError = require("../utils/AppError");

const isMaintenanceTokenValid = (providedToken, expectedToken) => {
  const provided = String(providedToken || "").trim();
  const expected = String(expectedToken || "").trim();
  return Boolean(expected) && provided === expected;
};

const assertMaintenanceAllowed = (req) => {
  const enabled = String(process.env.ENABLE_MAINTENANCE_ROUTES || "false") === "true";
  const expectedToken = process.env.MAINTENANCE_TOKEN;
  const providedToken = req.headers["x-maintenance-token"] || req.body?.maintenanceToken;

  if (!enabled || !isMaintenanceTokenValid(providedToken, expectedToken)) {
    throw new AppError("Maintenance amali o'chirilgan yoki token noto'g'ri", 403);
  }
};

const parsePeriod = (value) => {
  const requestedPeriod = String(value || "all").toLowerCase();
  const allowedPeriods = new Set(["all", "today", "week", "month"]);
  return allowedPeriods.has(requestedPeriod) ? requestedPeriod : "all";
};

const getAllChecks = asyncHandler(async (req, res) => {
  const checks = await reportService.getAllChecks();
  res.status(200).json({ success: true, data: checks });
});

const getRevenue = asyncHandler(async (req, res) => {
  const period = parsePeriod(req.query.period);

  const revenue = await reportService.getTotalRevenue({ period });
  res.status(200).json({ success: true, data: revenue });
});

const getOverview = asyncHandler(async (req, res) => {
  const period = parsePeriod(req.query.period);
  const overview = await reportService.getManagerOverview({ period });
  res.status(200).json({ success: true, data: overview });
});

const getMedicineUsageHistory = asyncHandler(async (req, res) => {
  const history = await reportService.getMedicineUsageHistory();
  res.status(200).json({ success: true, data: history });
});

const getCurrentStock = asyncHandler(async (req, res) => {
  const stock = await reportService.getCurrentStock();
  res.status(200).json({ success: true, data: stock });
});

const getMostUsedMedicines = asyncHandler(async (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 10;
  const mostUsed = await reportService.getMostUsedMedicines(limit);
  res.status(200).json({ success: true, data: mostUsed });
});

const getShiftCloseReport = asyncHandler(async (req, res) => {
  const data = await reportService.getShiftCloseReport({
    date: req.query.date
  });

  res.status(200).json({ success: true, data });
});

const getMonitoring = asyncHandler(async (req, res) => {
  const data = await reportService.getMonitoringOverview();
  res.status(200).json({ success: true, data });
});

const resetTodayOperationalData = asyncHandler(async (req, res) => {
  assertMaintenanceAllowed(req);

  const data = await reportService.resetTodayOperationalData({
    confirm: req.body?.confirm
  });

  res.status(200).json({ success: true, data });
});

const resetAllOperationalData = asyncHandler(async (req, res) => {
  assertMaintenanceAllowed(req);

  const data = await reportService.resetAllOperationalData({
    confirm: req.body?.confirm
  });

  res.status(200).json({ success: true, data });
});

module.exports = {
  getAllChecks,
  getRevenue,
  getOverview,
  getMedicineUsageHistory,
  getCurrentStock,
  getMostUsedMedicines,
  getShiftCloseReport,
  getMonitoring,
  resetTodayOperationalData,
  resetAllOperationalData
};
