const ExcelJS = require("exceljs");
const CashierEntry = require("../models/CashierEntry");
const ReporterDailyRecord = require("../models/ReporterDailyRecord");
const AppError = require("../utils/AppError");

const TASHKENT_OFFSET_HOURS = 5;
const AMOUNT_FIELDS = [
  "expenseAmount",
  "medicineAmount",
  "supplyAmount",
  "stationeryAmount",
  "communicationAmount",
  "childrenAmount",
  "homeAmount",
  "bossAmount",
  "terminalAmount",
  "transferAmount",
  "clickAmount",
  "debtAmount"
];

const AMOUNT_LABELS = {
  expenseAmount: "Harajat",
  medicineAmount: "Dori",
  supplyAmount: "Ta'minot",
  stationeryAmount: "Kanstovar",
  communicationAmount: "Aloqa",
  childrenAmount: "Farzandlarga",
  homeAmount: "Uy uchun",
  bossAmount: "Boshliq summasi",
  terminalAmount: "Terminal",
  transferAmount: "Perechisleniya",
  clickAmount: "Click",
  debtAmount: "Qarz"
};

const MONTH_LABELS = [
  "Yanvar",
  "Fevral",
  "Mart",
  "Aprel",
  "May",
  "Iyun",
  "Iyul",
  "Avgust",
  "Sentabr",
  "Oktabr",
  "Noyabr",
  "Dekabr"
];

const EXCEL_TEMPLATE_COLUMNS = [
  { header: "Kun", key: "date", width: 10 },
  { header: "Lor soni", key: "lorClientsCount", width: 10 },
  { header: "Lor summa", key: "lorPaidAmount", width: 14 },
  { header: "50%", key: "lorHalfPaidAmount", width: 14 },
  { header: "Protsedura soni", key: "procedureCount", width: 16 },
  { header: "Protsedura summa", key: "procedurePaidAmount", width: 18 },
  { header: "50% + Protsedura summa", key: "autoIncomeTotal", width: 24 },
  { header: "Kunlik xarajat", key: "expenseAmount", width: 15 },
  { header: "Dori", key: "medicineAmount", width: 13 },
  { header: "Ta'minot", key: "supplyAmount", width: 13 },
  { header: "Kanstovar", key: "stationeryAmount", width: 13 },
  { header: "Aloqa", key: "communicationAmount", width: 13 },
  { header: "Farzandlarga", key: "childrenAmount", width: 15 },
  { header: "Uy uchun", key: "homeAmount", width: 13 },
  { header: "Boshliq uchun", key: "bossAmount", width: 16 },
  { header: "Terminal summa", key: "terminalAmount", width: 16 },
  { header: "O'tkazilgan", key: "transferAmount", width: 16 },
  { header: "Qarz", key: "debtAmount", width: 12 },
  { header: "Jami harajat", key: "expenseTotal", width: 15 },
  { header: "Click", key: "clickAmount", width: 13 }
];

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
  totals.autoIncomeTotal +=
    row.cashier.lor.halfPaidAmount + row.cashier.procedure.paidAmount;
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
  autoIncomeTotal: 0,
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

const blankIfZero = (value) => {
  const number = Number(value || 0);
  return number > 0 ? number : null;
};

const sumValues = (...values) =>
  values.reduce((total, value) => total + Number(value || 0), 0);

const formatDateKeyForExcel = (dateKey) => {
  const { year, month, day } = parseDateParts(dateKey);
  return `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.${String(
    year
  ).slice(-2)}`;
};

const applyTemplateSheetStyle = (sheet, totalRowNumber) => {
  const headerFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
  const darkRowFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB4C6E7" } };
  const lightRowFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E2F3" } };
  const dateFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF5B9BD5" } };
  const border = {
    top: { style: "thin", color: { argb: "FFFFFFFF" } },
    left: { style: "thin", color: { argb: "FFFFFFFF" } },
    bottom: { style: "thin", color: { argb: "FFFFFFFF" } },
    right: { style: "thin", color: { argb: "FFFFFFFF" } }
  };

  sheet.views = [{ state: "frozen", ySplit: 1, showGridLines: false }];
  sheet.autoFilter = "A1:T1";
  sheet.properties.defaultRowHeight = 18;

  const headerRow = sheet.getRow(1);
  headerRow.height = 22;
  headerRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = headerFill;
    cell.font = { bold: true, name: "Calibri", size: 11, color: { argb: "FF000000" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = border;
  });

  for (let rowNumber = 2; rowNumber < totalRowNumber; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const fill = rowNumber % 2 === 0 ? lightRowFill : darkRowFill;
    row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      cell.fill = columnNumber === 1 ? dateFill : fill;
      cell.font = {
        bold: columnNumber === 1,
        name: "Calibri",
        size: 11,
        color: { argb: "FF000000" }
      };
      cell.alignment = {
        horizontal: columnNumber === 1 ? "center" : "right",
        vertical: "middle"
      };
      if (columnNumber === 1) {
        cell.numFmt = "dd\\.mm\\.yy;@";
      }
      cell.border = border;
    });
  }

  const totalRow = sheet.getRow(totalRowNumber);
  totalRow.height = 20;
  totalRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = headerFill;
    cell.font = { bold: true, name: "Calibri", size: 11, color: { argb: "FF000000" } };
    cell.alignment = { horizontal: "right", vertical: "middle" };
    cell.border = border;
  });
  sheet.getCell(`A${totalRowNumber}`).alignment = {
    horizontal: "left",
    vertical: "middle"
  };

  sheet.getColumn(1).numFmt = "dd\\.mm\\.yy;@";
  sheet.getColumn(1).alignment = { horizontal: "center", vertical: "middle" };
  setNumberFormat(sheet, Array.from({ length: 19 }, (_, index) => index + 2));
};

const addTemplateMonthSheet = (workbook, report, monthNumber) => {
  const sheetName = MONTH_LABELS[monthNumber - 1] || report.month;
  const sheet = workbook.addWorksheet(sheetName);

  sheet.columns = EXCEL_TEMPLATE_COLUMNS.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width
  }));

  report.rows.forEach((row, index) => {
    const excelRowNumber = index + 2;
    const lorPaidAmount = row.cashier.lor.paidAmount;
    const lorHalfPaidAmount = row.cashier.lor.halfPaidAmount;
    const procedurePaidAmount = row.cashier.procedure.paidAmount;
    const autoIncomeTotal = lorHalfPaidAmount + procedurePaidAmount;
    const expenseTotal = sumValues(
      row.manual.expenseAmount,
      row.manual.medicineAmount,
      row.manual.supplyAmount,
      row.manual.stationeryAmount,
      row.manual.communicationAmount,
      row.manual.childrenAmount,
      row.manual.homeAmount,
      row.manual.bossAmount,
      row.manual.debtAmount
    );

    sheet.addRow({
      date: formatDateKeyForExcel(row.date),
      lorClientsCount: blankIfZero(row.cashier.lor.count),
      lorPaidAmount: blankIfZero(lorPaidAmount),
      lorHalfPaidAmount: {
        formula: `IF(C${excelRowNumber}="","",C${excelRowNumber}/2)`,
        result: blankIfZero(lorHalfPaidAmount)
      },
      procedureCount: blankIfZero(row.cashier.procedure.proceduresCount),
      procedurePaidAmount: blankIfZero(procedurePaidAmount),
      autoIncomeTotal: {
        formula: `IF(AND(D${excelRowNumber}="",F${excelRowNumber}=""),"",D${excelRowNumber}+F${excelRowNumber})`,
        result: blankIfZero(autoIncomeTotal)
      },
      expenseAmount: blankIfZero(row.manual.expenseAmount),
      medicineAmount: blankIfZero(row.manual.medicineAmount),
      supplyAmount: blankIfZero(row.manual.supplyAmount),
      stationeryAmount: blankIfZero(row.manual.stationeryAmount),
      communicationAmount: blankIfZero(row.manual.communicationAmount),
      childrenAmount: blankIfZero(row.manual.childrenAmount),
      homeAmount: blankIfZero(row.manual.homeAmount),
      bossAmount: blankIfZero(row.manual.bossAmount),
      terminalAmount: blankIfZero(row.manual.terminalAmount),
      transferAmount: blankIfZero(row.manual.transferAmount),
      debtAmount: blankIfZero(row.manual.debtAmount),
      expenseTotal: {
        formula: `IF(COUNTA(H${excelRowNumber}:O${excelRowNumber},R${excelRowNumber})=0,"",SUM(H${excelRowNumber}:O${excelRowNumber},R${excelRowNumber}))`,
        result: blankIfZero(expenseTotal)
      },
      clickAmount: blankIfZero(row.manual.clickAmount)
    });
  });

  const totalRowNumber = report.rows.length + 2;
  const totalExpense = sumValues(
    report.totals.expenseAmount,
    report.totals.medicineAmount,
    report.totals.supplyAmount,
    report.totals.stationeryAmount,
    report.totals.communicationAmount,
    report.totals.childrenAmount,
    report.totals.homeAmount,
    report.totals.bossAmount,
    report.totals.debtAmount
  );
  const totalRowValues = {
    date: "Jami",
    lorClientsCount: {
      formula: `SUM(B2:B${totalRowNumber - 1})`,
      result: blankIfZero(report.totals.lorClientsCount)
    },
    lorPaidAmount: {
      formula: `SUM(C2:C${totalRowNumber - 1})`,
      result: blankIfZero(report.totals.lorPaidAmount)
    },
    lorHalfPaidAmount: {
      formula: `SUM(D2:D${totalRowNumber - 1})`,
      result: blankIfZero(report.totals.lorHalfPaidAmount)
    },
    procedureCount: {
      formula: `SUM(E2:E${totalRowNumber - 1})`,
      result: blankIfZero(report.totals.procedureCount)
    },
    procedurePaidAmount: {
      formula: `SUM(F2:F${totalRowNumber - 1})`,
      result: blankIfZero(report.totals.procedurePaidAmount)
    },
    autoIncomeTotal: {
      formula: `SUM(G2:G${totalRowNumber - 1})`,
      result: blankIfZero(report.totals.autoIncomeTotal)
    },
    expenseAmount: {
      formula: `SUM(H2:H${totalRowNumber - 1})`,
      result: blankIfZero(report.totals.expenseAmount)
    },
    medicineAmount: {
      formula: `SUM(I2:I${totalRowNumber - 1})`,
      result: blankIfZero(report.totals.medicineAmount)
    },
    supplyAmount: {
      formula: `SUM(J2:J${totalRowNumber - 1})`,
      result: blankIfZero(report.totals.supplyAmount)
    },
    stationeryAmount: {
      formula: `SUM(K2:K${totalRowNumber - 1})`,
      result: blankIfZero(report.totals.stationeryAmount)
    },
    communicationAmount: {
      formula: `SUM(L2:L${totalRowNumber - 1})`,
      result: blankIfZero(report.totals.communicationAmount)
    },
    childrenAmount: {
      formula: `SUM(M2:M${totalRowNumber - 1})`,
      result: blankIfZero(report.totals.childrenAmount)
    },
    homeAmount: {
      formula: `SUM(N2:N${totalRowNumber - 1})`,
      result: blankIfZero(report.totals.homeAmount)
    },
    bossAmount: {
      formula: `SUM(O2:O${totalRowNumber - 1})`,
      result: blankIfZero(report.totals.bossAmount)
    },
    terminalAmount: {
      formula: `SUM(P2:P${totalRowNumber - 1})`,
      result: blankIfZero(report.totals.terminalAmount)
    },
    transferAmount: {
      formula: `SUM(Q2:Q${totalRowNumber - 1})`,
      result: blankIfZero(report.totals.transferAmount)
    },
    debtAmount: {
      formula: `SUM(R2:R${totalRowNumber - 1})`,
      result: blankIfZero(report.totals.debtAmount)
    },
    expenseTotal: {
      formula: `SUM(S2:S${totalRowNumber - 1})`,
      result: blankIfZero(totalExpense)
    },
    clickAmount: {
      formula: `SUM(T2:T${totalRowNumber - 1})`,
      result: blankIfZero(report.totals.clickAmount)
    }
  };
  sheet.addRow(totalRowValues);
  applyTemplateSheetStyle(sheet, totalRowNumber);
};

const buildMonthlyWorkbook = async ({ month }) => {
  const { monthKey, year } = getMonthRange(month);
  const reports = await Promise.all(
    Array.from({ length: 12 }, (_, index) =>
      getMonthlyReport({ month: `${year}-${String(index + 1).padStart(2, "0")}` })
    )
  );
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sampi Medline";
  workbook.created = new Date();

  reports.forEach((report, index) => {
    addTemplateMonthSheet(workbook, report, index + 1);
  });

  return { workbook, report: { month: monthKey, year, reports } };
};

module.exports = {
  AMOUNT_FIELDS,
  getDailyReport,
  updateDailyRecord,
  getMonthlyReport,
  buildMonthlyWorkbook
};
