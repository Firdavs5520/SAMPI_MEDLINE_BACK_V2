const CashierEntry = require("../models/CashierEntry");
const CashierExpense = require("../models/CashierExpense");
const ReporterDailyRecord = require("../models/ReporterDailyRecord");
const AppError = require("../utils/AppError");
const cashierSettingsService = require("./cashierSettingsService");
const { buildCollectionStages } = require("./cashierCollections");
const { effectiveCashierRoleExpression } = require("./reportService");

// LOR doktorlari bilan 50/50 ishlanadi: kassaga tushgan LOR pulining yarmi doktorniki.
// Protsedura (muolaja xonasi) puli to'liq klinikaga qoladi.
const DOCTOR_SHARE_PERCENT = 50;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PAYMENT_METHODS = ["cash", "card", "transfer"];
// Svet, gaz, suv: hisobotchi o'z kunlik hisobotida kiritadi.
const UTILITY_FIELDS = [
  ["electricity", "electricityAmount", "Svet"],
  ["gas", "gasAmount", "Gaz"],
  ["water", "waterAmount", "Suv"]
];

const money = (value) => Math.round(Number(value || 0) * 100) / 100;
const doctorShareOf = (amount) => money((Number(amount || 0) * DOCTOR_SHARE_PERCENT) / 100);

const resolveDate = async (date) => {
  const safe = String(date || "").trim();
  if (!safe) return cashierSettingsService.getCurrentShiftDate();
  if (!DATE_PATTERN.test(safe)) {
    throw new AppError("Sana YYYY-MM-DD formatida bo'lishi kerak", 400);
  }
  return safe;
};

const toDateParts = (dateString) => {
  const [year, month, day] = dateString.split("-").map(Number);
  return { year, month, day };
};

const personKey = (role, name) => `${role}::${name}`;

// Hisobchi har kuni keladigan kunlik hisobot: qaysi doktor qancha ishladi, doktor ulushi,
// protsedura tushumi, qarzlar va kassa xarajatlari bitta joyda.
const getAccountantReport = async ({ date } = {}) => {
  const safeDate = await resolveDate(date);
  const { start, end, fromLabel, toLabel } = await cashierSettingsService.getShiftRange({
    dateString: safeDate,
    dateParts: toDateParts(safeDate)
  });

  const [entryGroups, [collected], [outstanding], expenses, reporterRecord] = await Promise.all([
    // Smenada qabul qilingan bemorlar: soni, chek summasi, hali to'lanmagan qarz.
    CashierEntry.aggregate([
      { $match: { entryDate: { $gte: start, $lte: end } } },
      { $addFields: { effectiveRole: effectiveCashierRoleExpression } },
      {
        $group: {
          _id: { role: "$effectiveRole", name: "$specialistName" },
          patients: { $sum: 1 },
          billed: { $sum: "$amount" },
          debtLeft: { $sum: "$debtAmount" }
        }
      }
    ]),
    // Smenada kassaga haqiqatda tushgan pul (eski qarzlar to'lovi ham shu kunga).
    CashierEntry.aggregate([
      ...buildCollectionStages({ start, end }),
      { $addFields: { effectiveRole: effectiveCashierRoleExpression } },
      {
        $facet: {
          byPerson: [
            {
              $group: {
                _id: { role: "$effectiveRole", name: "$specialistName" },
                collected: { $sum: "$collections.amount" },
                repaid: {
                  $sum: { $cond: [{ $lt: ["$entryDate", start] }, "$collections.amount", 0] }
                }
              }
            }
          ],
          byMethod: [
            { $group: { _id: "$collections.paymentMethod", amount: { $sum: "$collections.amount" } } }
          ]
        }
      }
    ]),
    CashierEntry.aggregate([
      { $match: { debtAmount: { $gt: 0 } } },
      { $group: { _id: null, amount: { $sum: "$debtAmount" }, count: { $sum: 1 } } }
    ]),
    CashierExpense.find({ shiftDate: safeDate, canceledAt: null })
      .sort({ createdAt: 1 })
      .select("amount reason paymentMethod createdAt createdBy.name")
      .lean(),
    ReporterDailyRecord.findOne({ dateKey: safeDate })
      .select(`${UTILITY_FIELDS.map(([, field]) => field).join(" ")} supplyAmount updatedBy.name createdBy.name`)
      .lean()
  ]);

  const people = new Map();
  const ensurePerson = (role, name) => {
    const key = personKey(role, name);
    if (!people.has(key)) {
      people.set(key, {
        role,
        name: name || "-",
        patients: 0,
        billed: 0,
        debtLeft: 0,
        collected: 0,
        repaid: 0
      });
    }
    return people.get(key);
  };

  for (const item of entryGroups) {
    const person = ensurePerson(item._id.role, item._id.name);
    person.patients = Number(item.patients || 0);
    person.billed = money(item.billed);
    person.debtLeft = money(item.debtLeft);
  }
  for (const item of collected?.byPerson || []) {
    const person = ensurePerson(item._id.role, item._id.name);
    person.collected = money(item.collected);
    person.repaid = money(item.repaid);
  }

  const sumBy = (rows, field) => money(rows.reduce((acc, row) => acc + Number(row[field] || 0), 0));
  const allPeople = Array.from(people.values());

  const doctors = allPeople
    .filter((person) => person.role === "lor")
    .map((person) => {
      const doctorShare = doctorShareOf(person.collected);
      return { ...person, doctorShare, clinicShare: money(person.collected - doctorShare) };
    })
    .sort((a, b) => b.collected - a.collected || a.name.localeCompare(b.name));

  const procedureRows = allPeople.filter((person) => person.role !== "lor");

  const lor = {
    patients: sumBy(doctors, "patients"),
    billed: sumBy(doctors, "billed"),
    collected: sumBy(doctors, "collected"),
    debtLeft: sumBy(doctors, "debtLeft"),
    doctorShare: sumBy(doctors, "doctorShare"),
    clinicShare: sumBy(doctors, "clinicShare")
  };
  const procedures = {
    patients: sumBy(procedureRows, "patients"),
    billed: sumBy(procedureRows, "billed"),
    collected: sumBy(procedureRows, "collected"),
    debtLeft: sumBy(procedureRows, "debtLeft")
  };

  const byPaymentMethod = Object.fromEntries(PAYMENT_METHODS.map((method) => [method, 0]));
  for (const item of collected?.byMethod || []) {
    if (item._id in byPaymentMethod) byPaymentMethod[item._id] = money(item.amount);
  }

  const expenseItems = expenses.map((item) => ({
    id: String(item._id),
    amount: money(item.amount),
    reason: item.reason,
    paymentMethod: item.paymentMethod,
    createdAt: item.createdAt,
    createdBy: item.createdBy?.name || ""
  }));
  const expenseTotal = sumBy(expenseItems, "amount");
  const cashExpenseTotal = sumBy(
    expenseItems.filter((item) => item.paymentMethod === "cash"),
    "amount"
  );

  const utilityItems = UTILITY_FIELDS.map(([key, field, label]) => ({
    key,
    label,
    amount: money(reporterRecord?.[field])
  }));
  const utilities = {
    // Hisobotchi bu kun uchun hali hech narsa kiritmagan bo'lsa false.
    entered: Boolean(reporterRecord),
    enteredBy: reporterRecord?.updatedBy?.name || reporterRecord?.createdBy?.name || "",
    items: utilityItems,
    // Eski yozuvlarda Ta'minot svet/gaz/suvga bo'linmagan: unda saqlangan umumiy summa olinadi.
    total: sumBy(utilityItems, "amount") || money(reporterRecord?.supplyAmount)
  };

  const totalCollected = money(lor.collected + procedures.collected);

  return {
    date: safeDate,
    shift: { fromLabel, toLabel },
    doctorSharePercent: DOCTOR_SHARE_PERCENT,
    doctors,
    lor,
    procedures,
    byPaymentMethod,
    debts: {
      // Shu smenada qabul qilingan bemorlardan hali to'lanmagan qism.
      newDebt: money(lor.debtLeft + procedures.debtLeft),
      // Oldingi kunlardan qolgan qarzlardan bugun to'langani.
      repaid: sumBy(allPeople, "repaid"),
      outstandingTotal: money(outstanding?.amount),
      outstandingCount: Number(outstanding?.count || 0)
    },
    expenses: {
      items: expenseItems,
      total: expenseTotal,
      cash: cashExpenseTotal
    },
    utilities,
    summary: {
      totalCollected,
      doctorsShare: lor.doctorShare,
      clinicIncome: money(lor.clinicShare + procedures.collected),
      expenses: expenseTotal,
      utilities: utilities.total,
      // Doktorlar ulushi, kassa xarajatlari va svet/gaz/suvdan keyin klinikaga qoladigan sof summa.
      clinicNet: money(lor.clinicShare + procedures.collected - expenseTotal - utilities.total),
      // Kassadagi naqd: naqd tushum - naqd xarajat (doktor ulushi berilishidan oldin).
      cashInHand: money(byPaymentMethod.cash - cashExpenseTotal)
    }
  };
};

module.exports = { DOCTOR_SHARE_PERCENT, getAccountantReport };
