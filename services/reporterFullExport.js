const ExcelJS = require("exceljs");
const CashierEntry = require("../models/CashierEntry");
const CashierExpense = require("../models/CashierExpense");
const Check = require("../models/Check");
const { buildCollectionStages } = require("./cashierCollections");
const {
  AMOUNT_LABELS,
  MONTH_LABELS,
  getMonthRange,
  getMonthlyReport,
  addTemplateMonthSheet
} = require("./reporterService");

// Bitta oy uchun to'liq Excel: umumiy xulosa, kunlik jadval, mutaxassislar, xizmatlar,
// dorilar, kassa xarajatlari, qarzdorlar va barcha kassa yozuvlari alohida varaqlarda.

const PAYMENT_LABELS = { cash: "Naqd", card: "Karta", transfer: "O'tkazma" };
const DEPARTMENT_LABELS = { lor: "LOR", nurse: "Hamshira", procedure: "Hamshira" };
const MONEY_FORMAT = "#,##0";
// Hisobotchi summalari xulosada shu tartibda: avval xarajat qismlari, keyin Hamma harajat.
const MANUAL_SUMMARY_ORDER = [
  "dailyExpenseAmount",
  "medicineAmount",
  "electricityAmount",
  "gasAmount",
  "waterAmount",
  "supplyAmount",
  "stationeryAmount",
  "communicationAmount",
  "childrenAmount",
  "homeAmount",
  "debtAmount",
  "expenseAmount",
  "bossAmount",
  "terminalAmount",
  "transferAmount",
  "clickAmount"
];
const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
const SECTION_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E2F3" } };
const TOTAL_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB4C6E7" } };

const toTashkentText = (date) => {
  if (!date) return "";
  const shifted = new Date(new Date(date).getTime() + 5 * 60 * 60 * 1000);
  if (Number.isNaN(shifted.getTime())) return "";
  const iso = shifted.toISOString();
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)} ${iso.slice(11, 16)}`;
};

const money = (value) => Math.round(Number(value || 0));

const departmentOf = (entry) =>
  DEPARTMENT_LABELS[entry.checkCreatorRole || entry.specialistType || entry.department] || "-";

// Jadval varag'i: sarlavha, ma'lumot qatorlari, ixtiyoriy "Jami" qatori.
const addTableSheet = (workbook, name, columns, rows, { totals = [] } = {}) => {
  const sheet = workbook.addWorksheet(name);
  sheet.columns = columns.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width || 16
  }));
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  rows.forEach((row) => sheet.addRow(row));

  if (rows.length && totals.length) {
    const totalRow = { [columns[0].key]: "Jami" };
    totals.forEach((key) => {
      const index = columns.findIndex((column) => column.key === key) + 1;
      const letter = sheet.getColumn(index).letter;
      totalRow[key] = {
        formula: `SUM(${letter}2:${letter}${rows.length + 1})`,
        result: rows.reduce((sum, row) => sum + Number(row[key] || 0), 0)
      };
    });
    const added = sheet.addRow(totalRow);
    added.font = { bold: true };
    added.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill = TOTAL_FILL;
    });
  }

  if (!rows.length) {
    sheet.addRow({ [columns[0].key]: "Bu oyda ma'lumot yo'q" });
  }

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.height = 22;
  header.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  columns.forEach((column, index) => {
    if (column.money) sheet.getColumn(index + 1).numFmt = MONEY_FORMAT;
  });
  if (rows.length) sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return sheet;
};

const loadMonthData = async ({ start, end }) => {
  const [entries, expenses, checks, collections] = await Promise.all([
    CashierEntry.find({ entryDate: { $gte: start, $lte: end } }).sort({ entryDate: 1 }).lean(),
    CashierExpense.find({ createdAt: { $gte: start, $lte: end } }).sort({ createdAt: 1 }).lean(),
    Check.find({ createdAt: { $gte: start, $lte: end } }).select("items createdBy total createdAt").lean(),
    CashierEntry.aggregate([
      ...buildCollectionStages({ start, end }),
      { $unwind: "$collections" },
      { $group: { _id: "$collections.paymentMethod", amount: { $sum: "$collections.amount" } } }
    ])
  ]);
  return { entries, expenses, checks, collections };
};

const buildSummaryRows = ({ monthLabel, report, entries, expenses, collections, checks }) => {
  const totals = report.totals || {};
  const activeExpenses = expenses.filter((item) => !item.canceledAt);
  const collected = Object.fromEntries(collections.map((row) => [row._id || "cash", money(row.amount)]));
  const collectedTotal = Object.values(collected).reduce((sum, value) => sum + value, 0);
  const expenseByMethod = activeExpenses.reduce((acc, item) => {
    acc[item.paymentMethod || "cash"] = (acc[item.paymentMethod || "cash"] || 0) + money(item.amount);
    return acc;
  }, {});
  const expenseTotal = Object.values(expenseByMethod).reduce((sum, value) => sum + value, 0);
  const entryAmount = entries.reduce((sum, entry) => sum + money(entry.amount), 0);
  const entryPaid = entries.reduce((sum, entry) => sum + money(entry.paidAmount), 0);
  const entryDebt = entries.reduce((sum, entry) => sum + money(entry.debtAmount), 0);
  // Hamma harajat (kunlik harajat, dori, ta'minot, kanstovar, aloqa, farzandlarga, uy uchun, qarz) + boshliq summasi.
  const manualExpenseTotal = money(totals.expenseAmount) + money(totals.bossAmount);

  return [
    { section: `${monthLabel} — umumiy hisobot` },
    { section: "Bemorlar va tushum" },
    { label: "LOR bemorlar soni", value: totals.lorClientsCount || 0 },
    { label: "LOR to'lovlari (kassaga tushgan)", value: money(totals.lorPaidAmount), money: true },
    { label: "LOR 50%", value: money(totals.lorHalfPaidAmount), money: true },
    { label: "Hamshira protseduralari soni", value: totals.procedureCount || 0 },
    { label: "Hamshira to'lovlari (kassaga tushgan)", value: money(totals.procedurePaidAmount), money: true },
    { label: "LOR 50% + hamshira (avtomatik daromad)", value: money(totals.autoIncomeTotal), money: true },
    { label: "Chiqarilgan cheklar soni", value: checks.length },
    { section: "Kassaga tushgan pul (to'lov usuli bo'yicha)" },
    { label: "Naqd", value: collected.cash || 0, money: true },
    { label: "Karta", value: collected.card || 0, money: true },
    { label: "O'tkazma", value: collected.transfer || 0, money: true },
    { label: "Jami tushum", value: collectedTotal, money: true, bold: true },
    { section: "Kassa yozuvlari (shu oyda qabul qilingan cheklar)" },
    { label: "Yozuvlar soni", value: entries.length },
    { label: "Cheklar summasi", value: entryAmount, money: true },
    { label: "Shundan to'langan", value: entryPaid, money: true },
    { label: "Qolgan qarz", value: entryDebt, money: true, bold: true },
    { section: "Kassadagi kutilmagan xarajatlar" },
    { label: "Naqd", value: expenseByMethod.cash || 0, money: true },
    { label: "Karta", value: expenseByMethod.card || 0, money: true },
    { label: "O'tkazma", value: expenseByMethod.transfer || 0, money: true },
    { label: "Jami kassa xarajatlari", value: expenseTotal, money: true, bold: true },
    { section: "Hisobotchi kiritgan summalar" },
    ...MANUAL_SUMMARY_ORDER.map((field) => ({
      label: AMOUNT_LABELS[field],
      value: money(totals[field]),
      money: true,
      bold: field === "expenseAmount"
    })),
    { label: "Hisobotchi xarajatlari jami (hamma harajat + boshliq)", value: manualExpenseTotal, money: true, bold: true },
    { section: "Yakun" },
    { label: "Jami tushum", value: collectedTotal, money: true },
    { label: "Jami xarajat (kassa + hisobotchi)", value: expenseTotal + manualExpenseTotal, money: true },
    {
      label: "Qoldiq (tushum − xarajat)",
      value: collectedTotal - expenseTotal - manualExpenseTotal,
      money: true,
      bold: true
    }
  ];
};

const addSummarySheet = (workbook, rows) => {
  const sheet = workbook.addWorksheet("Umumiy");
  sheet.columns = [
    { key: "label", width: 46 },
    { key: "value", width: 20 }
  ];
  rows.forEach((row, index) => {
    if (row.section) {
      const added = sheet.addRow({ label: row.section });
      added.font = { bold: true, size: index === 0 ? 14 : 12, color: { argb: index === 0 ? "FF1F3864" : "FF000000" } };
      if (index > 0) {
        added.getCell(1).fill = SECTION_FILL;
        added.getCell(2).fill = SECTION_FILL;
      }
      return;
    }
    const added = sheet.addRow({ label: row.label, value: row.value });
    if (row.money) added.getCell(2).numFmt = MONEY_FORMAT;
    if (row.bold) added.font = { bold: true };
    added.getCell(2).alignment = { horizontal: "right" };
  });
};

const buildFullMonthWorkbook = async ({ month }) => {
  const range = getMonthRange(month);
  const monthLabel = `${MONTH_LABELS[range.monthNumber - 1]} ${range.year}`;
  const [report, data] = await Promise.all([
    getMonthlyReport({ month: range.monthKey }),
    loadMonthData(range)
  ]);
  const { entries, expenses, checks, collections } = data;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sampi Medicine";
  workbook.created = new Date();

  addSummarySheet(
    workbook,
    buildSummaryRows({ monthLabel, report, entries, expenses, collections, checks })
  );

  // Kunlik jadval: yillik Excel'dagi bilan bir xil ko'rinish.
  addTemplateMonthSheet(workbook, report, range.monthNumber);
  workbook.worksheets[workbook.worksheets.length - 1].name = "Kunlik jadval";

  // Mutaxassislar bo'yicha.
  const bySpecialist = new Map();
  entries.forEach((entry) => {
    const department = departmentOf(entry);
    const name = entry.specialistName || entry.checkCreatorName || "-";
    const key = `${department}|${name}`;
    const row = bySpecialist.get(key) || { department, name, count: 0, amount: 0, paid: 0, debt: 0 };
    row.count += 1;
    row.amount += money(entry.amount);
    row.paid += money(entry.paidAmount);
    row.debt += money(entry.debtAmount);
    bySpecialist.set(key, row);
  });
  addTableSheet(
    workbook,
    "Mutaxassislar",
    [
      { header: "Bo'lim", key: "department", width: 12 },
      { header: "Mutaxassis", key: "name", width: 34 },
      { header: "Bemorlar", key: "count", width: 11 },
      { header: "Summa", key: "amount", width: 16, money: true },
      { header: "To'langan", key: "paid", width: 16, money: true },
      { header: "Qarz", key: "debt", width: 14, money: true }
    ],
    [...bySpecialist.values()].sort((a, b) => b.amount - a.amount),
    { totals: ["count", "amount", "paid", "debt"] }
  );

  // Xizmatlar va dorilar (cheklardagi qatorlar).
  const itemMaps = { service: new Map(), medicine: new Map() };
  checks.forEach((check) => {
    const department = DEPARTMENT_LABELS[check.createdBy?.role] || "-";
    (check.items || []).forEach((item) => {
      const type = item.itemType === "medicine" ? "medicine" : "service";
      const key = `${department}|${item.name}`;
      const row = itemMaps[type].get(key) || { department, name: item.name, quantity: 0, amount: 0 };
      row.quantity += Number(item.quantity || 0);
      row.amount += money(Number(item.price || 0) * Number(item.quantity || 0));
      itemMaps[type].set(key, row);
    });
  });
  const itemColumns = (nameHeader) => [
    { header: "Bo'lim", key: "department", width: 12 },
    { header: nameHeader, key: "name", width: 48 },
    { header: "Soni", key: "quantity", width: 10 },
    { header: "Summa", key: "amount", width: 16, money: true }
  ];
  const sortByQuantity = (map) => [...map.values()].sort((a, b) => b.quantity - a.quantity);
  addTableSheet(workbook, "Xizmatlar", itemColumns("Xizmat"), sortByQuantity(itemMaps.service), {
    totals: ["quantity", "amount"]
  });
  addTableSheet(workbook, "Dorilar", itemColumns("Dori"), sortByQuantity(itemMaps.medicine), {
    totals: ["quantity", "amount"]
  });

  addTableSheet(
    workbook,
    "Kassa xarajatlari",
    [
      { header: "Vaqt", key: "date", width: 18 },
      { header: "Summa", key: "amount", width: 14, money: true },
      { header: "Sabab", key: "reason", width: 44 },
      { header: "To'lov turi", key: "method", width: 12 },
      { header: "Kassir", key: "cashier", width: 18 },
      { header: "Holat", key: "status", width: 14 }
    ],
    expenses.map((item) => ({
      date: toTashkentText(item.createdAt),
      amount: item.canceledAt ? 0 : money(item.amount),
      reason: item.reason,
      method: PAYMENT_LABELS[item.paymentMethod] || item.paymentMethod || "-",
      cashier: item.createdBy?.name || "-",
      status: item.canceledAt ? `Bekor (${money(item.amount)})` : "Faol"
    })),
    { totals: ["amount"] }
  );

  const entryRow = (entry) => ({
    date: toTashkentText(entry.entryDate),
    department: departmentOf(entry),
    queue: entry.checkLorQueueCode || "",
    patient: entry.patientName,
    phone: entry.patientPhone || "",
    specialist: entry.specialistName || "-",
    amount: money(entry.amount),
    paid: money(entry.paidAmount),
    debt: money(entry.debtAmount),
    method: PAYMENT_LABELS[entry.paymentMethod] || entry.paymentMethod || "-"
  });
  const entryColumns = [
    { header: "Vaqt", key: "date", width: 18 },
    { header: "Bo'lim", key: "department", width: 11 },
    { header: "Navbat", key: "queue", width: 9 },
    { header: "Bemor", key: "patient", width: 26 },
    { header: "Telefon", key: "phone", width: 16 },
    { header: "Mutaxassis", key: "specialist", width: 28 },
    { header: "Summa", key: "amount", width: 14, money: true },
    { header: "To'langan", key: "paid", width: 14, money: true },
    { header: "Qarz", key: "debt", width: 13, money: true },
    { header: "To'lov turi", key: "method", width: 12 }
  ];
  addTableSheet(
    workbook,
    "Qarzdorlar",
    entryColumns,
    entries.filter((entry) => Number(entry.debtAmount || 0) > 0).map(entryRow),
    { totals: ["amount", "paid", "debt"] }
  );
  addTableSheet(workbook, "Kassa yozuvlari", entryColumns, entries.map(entryRow), {
    totals: ["amount", "paid", "debt"]
  });

  return { workbook, monthKey: range.monthKey };
};

module.exports = { buildFullMonthWorkbook };
