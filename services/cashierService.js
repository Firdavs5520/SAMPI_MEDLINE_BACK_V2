const CashierEntry = require("../models/CashierEntry");
const CashierSpecialist = require("../models/CashierSpecialist");
const AppError = require("../utils/AppError");

const DEPARTMENTS = ["lor", "nurse", "procedure"];
const SPECIALIST_TYPES = ["nurse", "lor"];
const PAYMENT_METHODS = ["cash", "card", "transfer", "mixed", "debt"];

const toDateString = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeDateString = (value) => {
  const safe = String(value || "").trim();
  if (!safe) return toDateString(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(safe)) {
    throw new AppError("date must be in YYYY-MM-DD format", 400);
  }
  return safe;
};

const getDateRange = (dateString) => {
  const safeDateString = normalizeDateString(dateString);
  const start = new Date(`${safeDateString}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) {
    throw new AppError("Invalid date", 400);
  }

  const end = new Date(`${safeDateString}T23:59:59.999Z`);
  return { safeDateString, start, end };
};

const normalizeDepartment = (value, { allowAll = false } = {}) => {
  const safe = String(value || "")
    .trim()
    .toLowerCase();

  if (!safe) return allowAll ? "all" : null;
  if (allowAll && safe === "all") return "all";
  if (!DEPARTMENTS.includes(safe)) {
    throw new AppError("department must be lor, nurse or procedure", 400);
  }
  return safe;
};

const normalizeSpecialistType = (value, { allowAll = false } = {}) => {
  const safe = String(value || "")
    .trim()
    .toLowerCase();

  if (!safe) return allowAll ? "all" : null;
  if (allowAll && safe === "all") return "all";
  if (!SPECIALIST_TYPES.includes(safe)) {
    throw new AppError("specialistType must be nurse or lor", 400);
  }
  return safe;
};

const normalizePaymentMethod = (value, { allowAll = false } = {}) => {
  const safe = String(value || "")
    .trim()
    .toLowerCase();

  if (!safe) return allowAll ? "all" : "cash";
  if (allowAll && safe === "all") return "all";
  if (!PAYMENT_METHODS.includes(safe)) {
    throw new AppError("paymentMethod must be cash, card, transfer, mixed or debt", 400);
  }
  return safe;
};

const validateAmount = (amount) => {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= 1000000) {
    throw new AppError("amount must be > 0 and < 1,000,000", 400);
  }
  return parsed;
};

const resolvePaidAndDebt = (amount, paidInput) => {
  const safeAmount = validateAmount(amount);
  const paidRaw =
    paidInput === undefined || paidInput === null || paidInput === ""
      ? safeAmount
      : Number(paidInput);

  if (!Number.isFinite(paidRaw) || paidRaw < 0 || paidRaw > safeAmount) {
    throw new AppError("paidAmount must be >= 0 and <= amount", 400);
  }

  const paidAmount = Number(paidRaw.toFixed(2));
  const debtAmount = Number((safeAmount - paidAmount).toFixed(2));

  return { paidAmount, debtAmount };
};

const assertCashierReadPermission = (user) => {
  if (!user || !["cashier", "manager"].includes(user.role)) {
    throw new AppError("Access denied for this role", 403);
  }
};

const assertCashierWritePermission = (user) => {
  if (!user || user.role !== "cashier") {
    throw new AppError("Only cashier can modify cashbook entries", 403);
  }
};

const buildListFilter = ({
  date,
  department,
  specialistType,
  paymentMethod,
  debtOnly,
  search
}) => {
  const { start, end, safeDateString } = getDateRange(date);
  const safeDepartment = normalizeDepartment(department, { allowAll: true });
  const safeSpecialistType = normalizeSpecialistType(specialistType, { allowAll: true });
  const safePaymentMethod = normalizePaymentMethod(paymentMethod, { allowAll: true });
  const safeDebtOnly = String(debtOnly || "")
    .trim()
    .toLowerCase();
  const safeSearch = String(search || "").trim();

  const filter = {
    entryDate: { $gte: start, $lte: end }
  };

  if (safeDepartment !== "all") {
    filter.department = safeDepartment;
  }

  if (safeSpecialistType !== "all") {
    filter.specialistType = safeSpecialistType;
  }

  if (safePaymentMethod !== "all") {
    filter.paymentMethod = safePaymentMethod;
  }

  if (safeDebtOnly === "true" || safeDebtOnly === "1") {
    filter.debtAmount = { $gt: 0 };
  }

  if (safeSearch) {
    const regex = new RegExp(escapeRegex(safeSearch), "i");
    filter.$or = [
      { patientName: regex },
      { specialistName: regex },
      { patientPhone: regex },
      { note: regex }
    ];
  }

  return {
    filter,
    safeDateString,
    safeDepartment,
    safeSpecialistType,
    safePaymentMethod,
    safeDebtOnly
  };
};

const resolveSpecialistData = async ({ specialistId, specialistName, specialistType }) => {
  const safeSpecialistType = normalizeSpecialistType(specialistType);
  const safeSpecialistId = String(specialistId || "").trim();
  const safeSpecialistName = String(specialistName || "").trim();

  if (safeSpecialistId) {
    const specialist = await CashierSpecialist.findById(safeSpecialistId);
    if (!specialist) {
      throw new AppError("Selected specialist not found", 404);
    }
    if (specialist.type !== safeSpecialistType) {
      throw new AppError("Selected specialist type mismatch", 400);
    }

    return {
      specialistId: specialist._id,
      specialistName: specialist.name,
      specialistType: specialist.type
    };
  }

  if (!safeSpecialistName) {
    throw new AppError("specialistName is required", 400);
  }

  return {
    specialistId: undefined,
    specialistName: safeSpecialistName,
    specialistType: safeSpecialistType
  };
};

const getEntries = async ({
  user,
  date,
  department,
  specialistType,
  paymentMethod,
  debtOnly,
  search
}) => {
  assertCashierReadPermission(user);

  const {
    filter,
    safeDateString,
    safeDepartment,
    safeSpecialistType,
    safePaymentMethod,
    safeDebtOnly
  } = buildListFilter({
    date,
    department,
    specialistType,
    paymentMethod,
    debtOnly,
    search
  });

  const entries = await CashierEntry.find(filter).sort({ createdAt: 1 });
  return {
    date: safeDateString,
    department: safeDepartment,
    specialistType: safeSpecialistType,
    paymentMethod: safePaymentMethod,
    debtOnly: safeDebtOnly === "true" || safeDebtOnly === "1",
    entries
  };
};

const getSummary = async ({
  user,
  date,
  department,
  specialistType,
  paymentMethod,
  debtOnly,
  search
}) => {
  assertCashierReadPermission(user);

  const {
    filter,
    safeDateString,
    safeDepartment,
    safeSpecialistType,
    safePaymentMethod,
    safeDebtOnly
  } = buildListFilter({
    date,
    department,
    specialistType,
    paymentMethod,
    debtOnly,
    search
  });

  const [summary] = await CashierEntry.aggregate([
    { $match: filter },
    {
      $facet: {
        overall: [
          {
            $group: {
              _id: null,
              totalAmount: { $sum: "$amount" },
              totalPaidAmount: { $sum: "$paidAmount" },
              totalDebtAmount: { $sum: "$debtAmount" },
              count: { $sum: 1 }
            }
          }
        ],
        byDepartment: [
          {
            $group: {
              _id: "$department",
              totalAmount: { $sum: "$amount" },
              totalPaidAmount: { $sum: "$paidAmount" },
              totalDebtAmount: { $sum: "$debtAmount" },
              count: { $sum: 1 }
            }
          }
        ],
        bySpecialistType: [
          {
            $group: {
              _id: "$specialistType",
              totalAmount: { $sum: "$amount" },
              totalPaidAmount: { $sum: "$paidAmount" },
              totalDebtAmount: { $sum: "$debtAmount" },
              count: { $sum: 1 }
            }
          }
        ]
      }
    }
  ]);

  const overall = summary?.overall?.[0] || {
    totalAmount: 0,
    totalPaidAmount: 0,
    totalDebtAmount: 0,
    count: 0
  };
  const byDepartment = {
    lor: { totalAmount: 0, totalPaidAmount: 0, totalDebtAmount: 0, count: 0 },
    nurse: { totalAmount: 0, totalPaidAmount: 0, totalDebtAmount: 0, count: 0 },
    procedure: { totalAmount: 0, totalPaidAmount: 0, totalDebtAmount: 0, count: 0 }
  };
  const bySpecialistType = {
    nurse: { totalAmount: 0, totalPaidAmount: 0, totalDebtAmount: 0, count: 0 },
    lor: { totalAmount: 0, totalPaidAmount: 0, totalDebtAmount: 0, count: 0 }
  };

  for (const item of summary?.byDepartment || []) {
    if (item?._id && byDepartment[item._id]) {
      byDepartment[item._id] = {
        totalAmount: Number(item.totalAmount || 0),
        totalPaidAmount: Number(item.totalPaidAmount || 0),
        totalDebtAmount: Number(item.totalDebtAmount || 0),
        count: Number(item.count || 0)
      };
    }
  }

  for (const item of summary?.bySpecialistType || []) {
    if (item?._id && bySpecialistType[item._id]) {
      bySpecialistType[item._id] = {
        totalAmount: Number(item.totalAmount || 0),
        totalPaidAmount: Number(item.totalPaidAmount || 0),
        totalDebtAmount: Number(item.totalDebtAmount || 0),
        count: Number(item.count || 0)
      };
    }
  }

  return {
    date: safeDateString,
    department: safeDepartment,
    specialistType: safeSpecialistType,
    paymentMethod: safePaymentMethod,
    debtOnly: safeDebtOnly === "true" || safeDebtOnly === "1",
    totalAmount: Number(overall.totalAmount || 0),
    totalPaidAmount: Number(overall.totalPaidAmount || 0),
    totalDebtAmount: Number(overall.totalDebtAmount || 0),
    totalEntries: Number(overall.count || 0),
    byDepartment,
    bySpecialistType
  };
};

const getSpecialists = async ({ user, type, search }) => {
  assertCashierReadPermission(user);

  const safeType = normalizeSpecialistType(type, { allowAll: true });
  const safeSearch = String(search || "").trim();
  const filter = {};

  if (safeType !== "all") {
    filter.type = safeType;
  }

  if (safeSearch) {
    filter.name = { $regex: escapeRegex(safeSearch), $options: "i" };
  }

  return CashierSpecialist.find(filter).sort({ type: 1, name: 1, createdAt: -1 });
};

const createSpecialist = async ({ payload, user }) => {
  assertCashierWritePermission(user);

  const type = normalizeSpecialistType(payload.type);
  const name = String(payload.name || "").trim();
  if (!name) {
    throw new AppError("Specialist name is required", 400);
  }

  try {
    return await CashierSpecialist.create({
      type,
      name,
      createdBy: {
        userId: user._id,
        role: user.role,
        name: user.name
      }
    });
  } catch (error) {
    if (error?.code === 11000) {
      throw new AppError("Bunday mutaxassis oldin qo'shilgan", 400);
    }
    throw error;
  }
};

const deleteSpecialist = async ({ specialistId, user }) => {
  assertCashierWritePermission(user);

  const specialist = await CashierSpecialist.findById(specialistId);
  if (!specialist) {
    throw new AppError("Specialist not found", 404);
  }

  const usedCount = await CashierEntry.countDocuments({ specialistId: specialist._id });
  if (usedCount > 0) {
    throw new AppError("Bu mutaxassis ishlatilgan, o'chirib bo'lmaydi", 400);
  }

  await CashierSpecialist.deleteOne({ _id: specialist._id });
  return { deleted: true, id: specialistId };
};

const createEntry = async ({ payload, user }) => {
  assertCashierWritePermission(user);

  const patientName = String(payload.patientName || "").trim();
  if (!patientName) {
    throw new AppError("patientName is required", 400);
  }

  const specialistType = normalizeSpecialistType(payload.specialistType || payload.department);
  const specialistData = await resolveSpecialistData({
    specialistId: payload.specialistId,
    specialistName: payload.specialistName,
    specialistType
  });
  const department = normalizeDepartment(payload.department || specialistData.specialistType);
  const amount = validateAmount(payload.amount);
  const { paidAmount, debtAmount } = resolvePaidAndDebt(amount, payload.paidAmount);
  const paymentMethod = normalizePaymentMethod(payload.paymentMethod);
  const { start } = getDateRange(payload.entryDate);

  return CashierEntry.create({
    department,
    patientName,
    amount,
    paidAmount,
    debtAmount,
    paymentMethod,
    specialistType: specialistData.specialistType,
    specialistName: specialistData.specialistName,
    ...(specialistData.specialistId ? { specialistId: specialistData.specialistId } : {}),
    patientPhone: String(payload.patientPhone || "").trim(),
    note: String(payload.note || "").trim(),
    entryDate: start,
    createdBy: {
      userId: user._id,
      role: user.role,
      name: user.name
    }
  });
};

const updateEntry = async ({ entryId, payload, user }) => {
  assertCashierWritePermission(user);

  const entry = await CashierEntry.findById(entryId);
  if (!entry) {
    throw new AppError("Cashier entry not found", 404);
  }

  if (payload.patientName !== undefined) {
    const patientName = String(payload.patientName || "").trim();
    if (!patientName) {
      throw new AppError("patientName is required", 400);
    }
    entry.patientName = patientName;
  }

  const nextSpecialistType =
    payload.specialistType !== undefined
      ? normalizeSpecialistType(payload.specialistType)
      : normalizeSpecialistType(entry.specialistType || entry.department || "lor");

  const nextSpecialistData = await resolveSpecialistData({
    specialistId:
      payload.specialistId !== undefined ? payload.specialistId : entry.specialistId,
    specialistName:
      payload.specialistName !== undefined ? payload.specialistName : entry.specialistName,
    specialistType: nextSpecialistType
  });

  entry.specialistType = nextSpecialistData.specialistType;
  entry.specialistName = nextSpecialistData.specialistName;
  entry.specialistId = nextSpecialistData.specialistId || undefined;

  if (payload.department !== undefined) {
    entry.department = normalizeDepartment(payload.department);
  } else if (!entry.department) {
    entry.department = normalizeDepartment(nextSpecialistData.specialistType);
  }

  const nextAmount =
    payload.amount !== undefined ? validateAmount(payload.amount) : validateAmount(entry.amount);
  const paidInput =
    payload.paidAmount !== undefined ? payload.paidAmount : entry.paidAmount ?? nextAmount;
  const { paidAmount, debtAmount } = resolvePaidAndDebt(nextAmount, paidInput);

  entry.amount = nextAmount;
  entry.paidAmount = paidAmount;
  entry.debtAmount = debtAmount;

  if (payload.paymentMethod !== undefined) {
    entry.paymentMethod = normalizePaymentMethod(payload.paymentMethod);
  } else if (!entry.paymentMethod) {
    entry.paymentMethod = "cash";
  }

  if (payload.patientPhone !== undefined) {
    entry.patientPhone = String(payload.patientPhone || "").trim();
  }

  if (payload.note !== undefined) {
    entry.note = String(payload.note || "").trim();
  }

  if (payload.entryDate !== undefined) {
    const { start } = getDateRange(payload.entryDate);
    entry.entryDate = start;
  }

  await entry.save();
  return entry;
};

const deleteEntry = async ({ entryId, user }) => {
  assertCashierWritePermission(user);

  const entry = await CashierEntry.findById(entryId);
  if (!entry) {
    throw new AppError("Cashier entry not found", 404);
  }

  await CashierEntry.deleteOne({ _id: entryId });
  return { deleted: true, id: entryId };
};

module.exports = {
  getEntries,
  getSummary,
  getSpecialists,
  createSpecialist,
  deleteSpecialist,
  createEntry,
  updateEntry,
  deleteEntry
};
