const CashierEntry = require("../models/CashierEntry");
const AppError = require("../utils/AppError");

const DEPARTMENTS = ["lor", "procedure"];

const toDateString = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

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
    throw new AppError("department must be lor or procedure", 400);
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

const assertCashierWritePermission = (user) => {
  if (!user || user.role !== "cashier") {
    throw new AppError("Only cashier can modify cashbook entries", 403);
  }
};

const buildListFilter = ({ date, department, search }) => {
  const { start, end, safeDateString } = getDateRange(date);
  const safeDepartment = normalizeDepartment(department, { allowAll: true });
  const safeSearch = String(search || "").trim();

  const filter = {
    entryDate: { $gte: start, $lte: end }
  };

  if (safeDepartment !== "all") {
    filter.department = safeDepartment;
  }

  if (safeSearch) {
    const regex = new RegExp(safeSearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [
      { patientName: regex },
      { specialistName: regex },
      { patientPhone: regex },
      { note: regex }
    ];
  }

  return { filter, safeDateString, safeDepartment };
};

const getEntries = async ({ user, date, department, search }) => {
  if (!user || !["cashier", "manager"].includes(user.role)) {
    throw new AppError("Access denied for this role", 403);
  }

  const { filter, safeDateString, safeDepartment } = buildListFilter({
    date,
    department,
    search
  });

  const entries = await CashierEntry.find(filter).sort({ createdAt: 1 });
  return {
    date: safeDateString,
    department: safeDepartment,
    entries
  };
};

const getSummary = async ({ user, date, department, search }) => {
  if (!user || !["cashier", "manager"].includes(user.role)) {
    throw new AppError("Access denied for this role", 403);
  }

  const { filter, safeDateString, safeDepartment } = buildListFilter({
    date,
    department,
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
              count: { $sum: 1 }
            }
          }
        ],
        byDepartment: [
          {
            $group: {
              _id: "$department",
              totalAmount: { $sum: "$amount" },
              count: { $sum: 1 }
            }
          }
        ]
      }
    }
  ]);

  const overall = summary?.overall?.[0] || { totalAmount: 0, count: 0 };
  const byDepartment = { lor: { totalAmount: 0, count: 0 }, procedure: { totalAmount: 0, count: 0 } };

  for (const item of summary?.byDepartment || []) {
    if (item?._id && byDepartment[item._id]) {
      byDepartment[item._id] = {
        totalAmount: Number(item.totalAmount || 0),
        count: Number(item.count || 0)
      };
    }
  }

  return {
    date: safeDateString,
    department: safeDepartment,
    totalAmount: Number(overall.totalAmount || 0),
    totalEntries: Number(overall.count || 0),
    byDepartment
  };
};

const createEntry = async ({ payload, user }) => {
  assertCashierWritePermission(user);

  const department = normalizeDepartment(payload.department);
  const patientName = String(payload.patientName || "").trim();
  const specialistName = String(payload.specialistName || "").trim();

  if (!patientName) {
    throw new AppError("patientName is required", 400);
  }
  if (!specialistName) {
    throw new AppError("specialistName is required", 400);
  }

  const amount = validateAmount(payload.amount);
  const { start } = getDateRange(payload.entryDate);

  return CashierEntry.create({
    department,
    patientName,
    amount,
    specialistName,
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

  if (payload.department !== undefined) {
    entry.department = normalizeDepartment(payload.department);
  }

  if (payload.patientName !== undefined) {
    const patientName = String(payload.patientName || "").trim();
    if (!patientName) {
      throw new AppError("patientName is required", 400);
    }
    entry.patientName = patientName;
  }

  if (payload.specialistName !== undefined) {
    const specialistName = String(payload.specialistName || "").trim();
    if (!specialistName) {
      throw new AppError("specialistName is required", 400);
    }
    entry.specialistName = specialistName;
  }

  if (payload.amount !== undefined) {
    entry.amount = validateAmount(payload.amount);
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
  createEntry,
  updateEntry,
  deleteEntry
};
