const asyncHandler = require("../utils/asyncHandler");
const reporterService = require("../services/reporterService");

const getDailyReport = asyncHandler(async (req, res) => {
  const data = await reporterService.getDailyReport({
    date: req.query.date
  });

  res.status(200).json({ success: true, data });
});

const updateDailyRecord = asyncHandler(async (req, res) => {
  const data = await reporterService.updateDailyRecord({
    payload: req.body,
    user: req.user
  });

  res.status(200).json({ success: true, data });
});

const getMonthlyReport = asyncHandler(async (req, res) => {
  const data = await reporterService.getMonthlyReport({
    month: req.query.month
  });

  res.status(200).json({ success: true, data });
});

const exportMonthlyReport = asyncHandler(async (req, res) => {
  const { workbook, report } = await reporterService.buildMonthlyWorkbook({
    month: req.query.month
  });
  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `sampi-reporter-${report.year}.xlsx`;

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.status(200).send(Buffer.from(buffer));
});

module.exports = {
  getDailyReport,
  updateDailyRecord,
  getMonthlyReport,
  exportMonthlyReport
};
