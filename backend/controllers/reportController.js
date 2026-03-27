const asyncHandler = require("../utils/asyncHandler");
const reportService = require("../services/reportService");

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

module.exports = {
  getAllChecks,
  getRevenue,
  getOverview,
  getMedicineUsageHistory,
  getCurrentStock,
  getMostUsedMedicines
};
