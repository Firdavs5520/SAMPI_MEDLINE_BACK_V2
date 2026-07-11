const ExcelJS = require("exceljs");
const CashierEntry = require("../models/CashierEntry");
const ReporterDailyRecord = require("../models/ReporterDailyRecord");
const AppError = require("../utils/AppError");

const TASHKENT_OFFSET_HOURS = 5;
const AMOUNT_FIELDS = [
  "expenseAmount",
  "supplyAmount",
  "medicineAmount",
  "bossAmount",
  "terminalAmount",
  "transferAmount",
  "clickAmount",
  "debtAmount"
];

const AMOUNT_LABELS = {
  expenseAmount: "Harajat",
  supplyAmount: "Ta'minot",
  medicineAmount: "Dori",
  bossAmount: "Boshliq summasi",
  terminalAmount: "Terminal",
  transferAmount: "Perechisleniya",
  clickAmount: "Click",
  debtAmount: "Qarz"
};

const emptyCashierStats = () => ({
  count: 0,
  totalAmount: 0,
  paidAmount: 0,
  debtAmount: 0
});

const emptyManualAmounts = () =>
  AMOUNT_FIELDS.reduce(
    (acc, key) => ({
      ...acc,
      [key]: 0
    }),
    { note: "" }
  );

const normalizeDateString = (value) => {
  const safe = String(value || "").trim();
  if (!safe) {
    return new Date(Date.now() + TASHKENT_OFFSET_HOURS * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(safe)) {
    throw new AppError("Sana YYYY-MM-DD formatida bo'lishi kerak", 400);
  }

  return safe;
};

const normalizeMonthString = (value) => {
  const safe = String(value || "").trim();
  if (!safe) {
    return new Date(Date.now() + TASHKENT_OFFSET_HOURS * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 7);
  }

  if (!/^\d{4}-\d{2}$/.test(safe)) {
    throw new AppError("Oy YYYY-MM formatida bo'lishi kerak", 400);
  }

  return safe;
};

const parseDateParts = (dateString) => {
  const [yearPart, monthPart, dayPart] = dateString.split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new AppError("Sana noto'g'ri", 400);
  }

  return { year, month, day };
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
      hour - TASHKENT_OFFSET_HOURS,
      minute,
      second,
      ms
    )
  );

const getDateRange = (date) => {
  const dateKey = normalizeDateString(date);
  const { year, month, day } = parseDateParts(dateKey);
  const start = toUtcDateFromTashkent(year, month, day, 0, 0, 0, 0);
  const end = toUtcDateFromTashkent(year, month, day, 23, 59, 59, 999);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new AppError("Sana noto'g'ri", 400);
  }

  return { dateKey, start, end };
};

const getMonthRange = (month) => {
  const monthKey = normalizeMonthString(month);
  const [yearPart, monthPart] = monthKey.split("-");
  const year = Number(yearPart);
  const monthNumber = Number(monthPart);
  const start = toUtcDateFromTashkent(year, monthNumber, 1, 0, 0, 0, 0);
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
  const nextMonthYear = monthNumber === 12 ? year + 1 : year;
  const nextStart = toUtcDateFromTashkent(nextMonthYear, nextMonth, 1, 0, 0, 0, 0);
  const end = new Date(nextStart.getTime() - 1);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const dateKeys = Array.from({ length: daysInMonth }, (_, index) => {
    const day = String(index + 1).padStart(2, "0");
    return `${monthKey}-${day}`;
  });

  return {
    monthKey,
    year,
    monthNumber,
    start,
    end,
    dateKeys
  };
};

const effectiveCashierRoleExpression = {
  $cond: [
    { $in: ["$checkCreatorRole", ["nurse", "lor"]] },
    "$checkCreatorRole",
    {
      $cond: [
        { $in: ["$specialistType", ["nurse", "lor"]] },
        "$specialistType",
        {
          $cond: [{ $eq: ["$department", "procedure"] }, "nurse", "$department"]
        }
      ]
    }
  ]
};

const normalizeAmount = (value, label) => {
  if (value === undefined || value === null || value === "") return 0;
  const parsed =
    typeof value === "number"
      ? value
      : Number(String(value).replace(/\s/g, "").replace(",", "."));

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 999999999999) {
    throw new AppError(`${label} summasi noto'g'ri`, 400);
  }

  return Number(parsed.toFixed(2));
};

const buildUserStamp = (user) => ({
  userId: user._id,
  role: user.role,
  name: user.name
});

const normalizeManualRecord = (record) => {
  const manual = emptyManualAmounts();
  if (!record) return manual;

  for (const field of AMOUNT_FIELDS) {
    manual[field] = Number(record[field] || 0);
  }

  manual.note = String(record.note || "").trim();
  return manual;
};

const mapStats = (stats = emptyCashierStats()) => ({
  count: Number(stats.count || 0),
  totalAmount: Number(stats.totalAmount || 0),
  paidAmount: Number(stats.paidAmount || 0),
  debtAmount: Number(stats.debtAmount || 0)
});

const buildReportRow = ({ dateKey, cashier = {}, manualRecord = null }) => {
  const lor = mapStats(cashier.lor);
  const procedure = mapStats(cashier.nurse);
  const total = mapStats(cashier.total);
  const manual = normalizeManualRecord(manualRecord);

  return {
    date: dateKey,
    cashier: {
      lor: {
        ...lor,
        halfTotalAmount: Number((lor.totalAmount / 2).toFixed(2)),
        halfPaidAmount: Number((lor.paidAmount / 2).toFixed(2))
      },
      procedure: {
        ...procedure,
        proceduresCount: procedure.count
      },
      total
    },
    manual
  };
};

const aggregateCashierByDay = async ({ start, end }) => {
  const rows = await CashierEntry.aggregate([
    {
      $match: {
        entryDate: { $gte: start, $lte: end }
      }
    },
    {
      $addFields: {
        dateKey: {
          $dateToString: {
            date: "$entryDate",
            format: "%Y-%m-%d",
            timezone: "+05:00"
          }
        },
        effectiveRole: effectiveCashierRoleExpression
      }
    },
    {
      $group: {
        _id: {
          dateKey: "$dateKey",
          role: "$effectiveRole"
        },
        count: { $sum: 1 },
        totalAmount: { $sum: "$amount" },
        paidAmount: { $sum: "$paidAmount" },
        debtAmount: { $sum: "$debtAmount" }
      }
    }
  ]);

  const byDate = {};

  for (const item of rows) {
    const dateKey = item?._id?.dateKey;
    const role = item?._id?.role;
    if (!dateKey || !["lor", "nurse"].includes(role)) continue;

    byDate[dateKey] = byDate[dateKey] || {
      lor: emptyCashierStats(),
      nurse: emptyCashierStats(),
      total: emptyCashierStats()
    };

    byDate[dateKey][role] = mapStats(item);
    byDate[dateKey].total.count += Number(item.count || 0);
    byDate[dateKey].total.totalAmount += Number(item.totalAmount || 0);
    byDate[dateKey].total.paidAmount += Number(item.paidAmount || 0);
    byDate[dateKey].total.debtAmount += Number(item.debtAmount || 0);
  }

  return byDate;
};

const getDailyReport = async ({ date }) => {
  const { dateKey, start, end } = getDateRange(date);
  const [cashierByDay, manualRecord] = await Promise.all([
    aggregateCashierByDay({ start, end }),
    ReporterDailyRecord.findOne({ dateKey }).lean()
  ]);

  return buildReportRow({
    dateKey,
    cashier: cashierByDay[dateKey],
    manualRecord
  });
};

const updateDailyRecord = async ({ payload, user }) => {
  const { dateKey, start } = getDateRange(payload?.date);
  const $set = {
    updatedBy: buildUserStamp(user)
  };
  const $setOnInsert = {
    dateKey,
    reportDate: start,
    createdBy: buildUserStamp(user)
  };

  for (const field of AMOUNT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload || {}, field)) {
      $set[field] = normalizeAmount(payload[field], AMOUNT_LABELS[field]);
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload || {}, "note")) {
    $set.note = String(payload.note || "").trim().slice(0, 500);
  }

  await ReporterDailyRecord.findOneAndUpdate(
    { dateKey },
    { $set, $setOnInsert },
    { new: true, runValidators: true, upsert: true }
  );

  return getDailyReport({ date: dateKey });
};

const addRowToTotals = (totals, row) => {
  totals.lorClientsCount += row.cashier.lor.count;
  totals.lorTotalAmount += row.cashier.lor.totalAmount;
  totals.lorPaidAmount += row.cashier.lor.paidAmount;
  totals.lorHalfPaidAmount += row.cashier.lor.halfPaidAmount;
  totals.procedureCount += row.cashier.procedure.proceduresCount;
  totals.procedureTotalAmount += row.cashier.procedure.totalAmount;
  totals.procedurePaidAmount += row.cashier.procedure.paidAmount;
  totals.cashierDebtAmount += row.cashier.total.debtAmount;

  for (const field of AMOUNT_FIELDS) {
    totals[field] += row.manual[field];
  }
};

const createEmptyTotals = () => ({
  lorClientsCount: 0,
  lorTotalAmount: 0,
  lorPaidAmount: 0,
  lorHalfPaidAmount: 0,
  procedureCount: 0,
  procedureTotalAmount: 0,
  procedurePaidAmount: 0,
  cashierDebtAmount: 0,
  ...AMOUNT_FIELDS.reduce((acc, field) => ({ ...acc, [field]: 0 }), {})
});

const getMonthlyReport = async ({ month }) => {
  const { monthKey, start, end, dateKeys } = getMonthRange(month);
  const [cashierByDay, manualRows] = await Promise.all([
    aggregateCashierByDay({ start, end }),
    ReporterDailyRecord.find({
      dateKey: { $gte: `${monthKey}-01`, $lte: `${monthKey}-31` }
    }).lean()
  ]);

  const manualByDate = new Map(manualRows.map((row) => [row.dateKey, row]));
  const rows = dateKeys.map((dateKey) =>
    buildReportRow({
      dateKey,
      cashier: cashierByDay[dateKey],
      manualRecord: manualByDate.get(dateKey)
    })
  );
  const totals = createEmptyTotals();
  rows.forEach((row) => addRowToTotals(totals, row));

  return {
    month: monthKey,
    rows,
    totals
  };
};

const setNumberFormat = (worksheet, indexes) => {
  for (const index of indexes) {
    worksheet.getColumn(index).numFmt = '#,##0';
  }
};

const buildMonthlyWorkbook = async ({ month }) => {
  const report = await getMonthlyReport({ month });
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sampi Medline";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Reporter hisobot", {
    views: [{ state: "frozen", ySplit: 1 }]
  });

  sheet.columns = [
    { header: "Sana", key: "date", width: 14 },
    { header: "LOR mijozlari soni", key: "lorClientsCount", width: 18 },
    { header: "LOR jami summa", key: "lorTotalAmount", width: 18 },
    { header: "LOR kelgan summa", key: "lorPaidAmount", width: 18 },
    { header: "LOR 50%", key: "lorHalfPaidAmount", width: 16 },
    { header: "Protsedura soni", key: "procedureCount", width: 18 },
    { header: "Protsedura jami", key: "procedureTotalAmount", width: 18 },
    { header: "Protsedura kelgan", key: "procedurePaidAmount", width: 18 },
    { header: "Harajat", key: "expenseAmount", width: 16 },
    { header: "Ta'minot", key: "supplyAmount", width: 16 },
    { header: "Dori", key: "medicineAmount", width: 16 },
    { header: "Boshliq", key: "bossAmount", width: 16 },
    { header: "Terminal", key: "terminalAmount", width: 16 },
    { header: "Perechisleniya", key: "transferAmount", width: 18 },
    { header: "Click", key: "clickAmount", width: 16 },
    { header: "Reporter qarz", key: "debtAmount", width: 16 },
    { header: "Kassadagi qarz", key: "cashierDebtAmount", width: 16 },
    { header: "Izoh", key: "note", width: 32 }
  ];

  for (const row of report.rows) {
    sheet.addRow({
      date: row.date,
      lorClientsCount: row.cashier.lor.count,
      lorTotalAmount: row.cashier.lor.totalAmount,
      lorPaidAmount: row.cashier.lor.paidAmount,
      lorHalfPaidAmount: row.cashier.lor.halfPaidAmount,
      procedureCount: row.cashier.procedure.proceduresCount,
      procedureTotalAmount: row.cashier.procedure.totalAmount,
      procedurePaidAmount: row.cashier.procedure.paidAmount,
      expenseAmount: row.manual.expenseAmount,
      supplyAmount: row.manual.supplyAmount,
      medicineAmount: row.manual.medicineAmount,
      bossAmount: row.manual.bossAmount,
      terminalAmount: row.manual.terminalAmount,
      transferAmount: row.manual.transferAmount,
      clickAmount: row.manual.clickAmount,
      debtAmount: row.manual.debtAmount,
      cashierDebtAmount: row.cashier.total.debtAmount,
      note: row.manual.note
    });
  }

  sheet.addRow({});
  const totalRow = sheet.addRow({
    date: "Jami",
    lorClientsCount: report.totals.lorClientsCount,
    lorTotalAmount: report.totals.lorTotalAmount,
    lorPaidAmount: report.totals.lorPaidAmount,
    lorHalfPaidAmount: report.totals.lorHalfPaidAmount,
    procedureCount: report.totals.procedureCount,
    procedureTotalAmount: report.totals.procedureTotalAmount,
    procedurePaidAmount: report.totals.procedurePaidAmount,
    expenseAmount: report.totals.expenseAmount,
    supplyAmount: report.totals.supplyAmount,
    medicineAmount: report.totals.medicineAmount,
    bossAmount: report.totals.bossAmount,
    terminalAmount: report.totals.terminalAmount,
    transferAmount: report.totals.transferAmount,
    clickAmount: report.totals.clickAmount,
    debtAmount: report.totals.debtAmount,
    cashierDebtAmount: report.totals.cashierDebtAmount
  });

  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0F766E" }
  };
  sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
  sheet.getRow(1).height = 24;
  totalRow.font = { bold: true };
  totalRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE0F2FE" }
  };
  setNumberFormat(sheet, Array.from({ length: 16 }, (_, index) => index + 2));
  sheet.getColumn(18).alignment = { wrapText: true, vertical: "top" };

  return { workbook, report };
};

module.exports = {
  AMOUNT_FIELDS,
  getDailyReport,
  updateDailyRecord,
  getMonthlyReport,
  buildMonthlyWorkbook
};
