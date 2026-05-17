const CashierEntry = require("../models/CashierEntry");
const CashierSpecialist = require("../models/CashierSpecialist");
const Check = require("../models/Check");
const AppError = require("../utils/AppError");

const DEPARTMENTS = ["lor", "nurse", "procedure"];
const SPECIALIST_TYPES = ["nurse", "lor"];
const PAYMENT_METHODS = ["cash", "card", "transfer"];
const TIME_SCOPES = ["all", "active", "history"];
const TASHKENT_UTC_OFFSET_HOURS = 5;
const SHIFT_START_HOUR = 8;
const SHIFT_END_HOUR = 2;
const SHIFT_LABEL_FROM = "08:00";
const SHIFT_LABEL_TO = "02:00";
const CHECK_CREATOR_ROLES = ["nurse", "lor"];
const isValidObjectId = (value) =>
  typeof value === "string" && /^[a-f\d]{24}$/i.test(value);

const toTashkentDateString = (date = new Date()) =>
  new Date(date.getTime() + TASHKENT_UTC_OFFSET_HOURS * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeDateString = (value) => {
  const safe = String(value || "").trim();
  if (!safe) return toTashkentDateString(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(safe)) {
    throw new AppError("Sana YYYY-MM-DD formatida bo'lishi kerak", 400);
  }
  return safe;
};

const parseDateParts = (dateString) => {
  const [yearPart, monthPart, dayPart] = String(dateString).split("-");
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
      hour - TASHKENT_UTC_OFFSET_HOURS,
      minute,
      second,
      ms
    )
  );

const getDateRange = (dateString) => {
  const safeDateString = normalizeDateString(dateString);
  const { year, month, day } = parseDateParts(safeDateString);
  const start = toUtcDateFromTashkent(year, month, day, 0, 0, 0, 0);
  if (Number.isNaN(start.getTime())) {
    throw new AppError("Sana noto'g'ri", 400);
  }

  const end = toUtcDateFromTashkent(year, month, day, 23, 59, 59, 999);
  return { safeDateString, start, end };
};

const getShiftRange = (dateString) => {
  const safeDateString = normalizeDateString(dateString);
  const { year, month, day } = parseDateParts(safeDateString);
  const start = toUtcDateFromTashkent(year, month, day, SHIFT_START_HOUR, 0, 0, 0);
  const shiftEndsNextDay = SHIFT_END_HOUR <= SHIFT_START_HOUR;
  const endBoundary = toUtcDateFromTashkent(
    year,
    month,
    shiftEndsNextDay ? day + 1 : day,
    SHIFT_END_HOUR,
    0,
    0,
    0
  );
  const end = new Date(endBoundary.getTime() - 1);

  return {
    safeDateString,
    start,
    end
  };
};

const normalizeDepartment = (value, { allowAll = false } = {}) => {
  const safe = String(value || "")
    .trim()
    .toLowerCase();

  if (!safe) return allowAll ? "all" : null;
  if (allowAll && safe === "all") return "all";
  if (!DEPARTMENTS.includes(safe)) {
    throw new AppError("Bo'lim lor, nurse yoki procedure bo'lishi kerak", 400);
  }
  return safe === "procedure" ? "nurse" : safe;
};

const normalizeSpecialistType = (value, { allowAll = false } = {}) => {
  const safe = String(value || "")
    .trim()
    .toLowerCase();

  if (!safe) return allowAll ? "all" : null;
  if (allowAll && safe === "all") return "all";
  if (!SPECIALIST_TYPES.includes(safe)) {
    throw new AppError("Mutaxassis turi nurse yoki lor bo'lishi kerak", 400);
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
    throw new AppError("To'lov usuli cash, card yoki transfer bo'lishi kerak", 400);
  }
  return safe;
};

const normalizeTimeScope = (value) => {
  const safe = String(value || "all")
    .trim()
    .toLowerCase();

  if (!TIME_SCOPES.includes(safe)) {
    throw new AppError("timeScope all, active yoki history bo'lishi kerak", 400);
  }

  return safe;
};

const normalizeCheckCreatorRole = (value, { allowAll = true } = {}) => {
  const safe = String(value || "")
    .trim()
    .toLowerCase();

  if (!safe) {
    return allowAll ? "all" : null;
  }

  if (allowAll && safe === "all") {
    return "all";
  }

  if (!CHECK_CREATOR_ROLES.includes(safe)) {
    throw new AppError("Chek roli nurse yoki lor bo'lishi kerak", 400);
  }

  return safe;
};

const validateAmount = (amount) => {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= 1000000) {
    throw new AppError("Summa 0 dan katta va 1,000,000 dan kichik bo'lishi kerak", 400);
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
    throw new AppError("To'langan summa 0 dan kichik bo'lmasligi va jami summadan oshmasligi kerak", 400);
  }

  const paidAmount = Number(paidRaw.toFixed(2));
  const debtAmount = Number((safeAmount - paidAmount).toFixed(2));

  return { paidAmount, debtAmount };
};

const assertCashierReadPermission = (user) => {
  if (!user || !["cashier", "manager"].includes(user.role)) {
    throw new AppError("Bu rol uchun ruxsat yo'q", 403);
  }
};

const assertCashierWritePermission = (user) => {
  if (!user || user.role !== "cashier") {
    throw new AppError("Kassa yozuvlarini faqat kassir o'zgartira oladi", 403);
  }
};

const buildListFilter = ({
  date,
  department,
  specialistType,
  paymentMethod,
  debtOnly,
  search,
  timeScope = "all"
}) => {
  const { start: dayStart, end: dayEnd, safeDateString } = getDateRange(date);
  const { start: shiftStart, end: shiftEnd } = getShiftRange(safeDateString);
  const safeDepartment = normalizeDepartment(department, { allowAll: true });
  const safeSpecialistType = normalizeSpecialistType(specialistType, { allowAll: true });
  const safePaymentMethod = normalizePaymentMethod(paymentMethod, { allowAll: true });
  const safeTimeScope = normalizeTimeScope(timeScope);
  const safeDebtOnly = String(debtOnly || "")
    .trim()
    .toLowerCase();
  const safeSearch = String(search || "").trim();
  const andConditions = [];

  if (safeTimeScope === "active") {
    andConditions.push({
      entryDate: { $gte: shiftStart, $lte: shiftEnd }
    });
  } else if (safeTimeScope === "history") {
    andConditions.push({
      entryDate: { $gte: dayStart, $lte: dayEnd }
    });
    andConditions.push({
      $or: [{ entryDate: { $lt: shiftStart } }, { entryDate: { $gt: shiftEnd } }]
    });
  } else {
    andConditions.push({
      entryDate: { $gte: dayStart, $lte: dayEnd }
    });
  }

  if (safeDepartment !== "all") {
    if (safeDepartment === "nurse") {
      andConditions.push({ department: { $in: ["nurse", "procedure"] } });
    } else {
      andConditions.push({ department: safeDepartment });
    }
  }

  if (safeSpecialistType !== "all") {
    andConditions.push({ specialistType: safeSpecialistType });
  }

  if (safePaymentMethod !== "all") {
    andConditions.push({ paymentMethod: safePaymentMethod });
  }

  if (safeDebtOnly === "true" || safeDebtOnly === "1") {
    andConditions.push({ debtAmount: { $gt: 0 } });
  }

  if (safeSearch) {
    const regex = new RegExp(escapeRegex(safeSearch), "i");
    andConditions.push({
      $or: [
        { patientName: regex },
        { specialistName: regex },
        { patientPhone: regex },
        { note: regex }
      ]
    });
  }

  const filter =
    andConditions.length === 1
      ? andConditions[0]
      : {
          $and: andConditions
        };

  return {
    filter,
    safeDateString,
    safeDepartment,
    safeSpecialistType,
    safePaymentMethod,
    safeDebtOnly,
    safeTimeScope,
    shiftStart,
    shiftEnd
  };
};

const resolveSpecialistData = async ({ specialistId, specialistName, specialistType }) => {
  const safeSpecialistType = normalizeSpecialistType(specialistType);
  const safeSpecialistId = String(specialistId || "").trim();
  const safeSpecialistName = String(specialistName || "").trim();

  if (safeSpecialistId) {
    const specialist = await CashierSpecialist.findById(safeSpecialistId);
    if (!specialist) {
      throw new AppError("Tanlangan mutaxassis topilmadi", 404);
    }
    if (specialist.type !== safeSpecialistType) {
      throw new AppError("Tanlangan mutaxassis turi mos emas", 400);
    }

    return {
      specialistId: specialist._id,
      specialistName: specialist.name,
      specialistType: specialist.type
    };
  }

  if (!safeSpecialistName) {
    throw new AppError("Mutaxassis nomi majburiy", 400);
  }

  return {
    specialistId: undefined,
    specialistName: safeSpecialistName,
    specialistType: safeSpecialistType
  };
};

const normalizeCheckObjectId = (value) => {
  const safe = String(value || "").trim();
  if (!isValidObjectId(safe)) {
    throw new AppError("Chek ID noto'g'ri", 400);
  }
  return safe;
};

const resolvePatientNameFromCheck = (check, { strict = true } = {}) => {
  const fullName = String(check?.patient?.fullName || "").trim();
  if (fullName) {
    return fullName;
  }

  const firstName = String(check?.patient?.firstName || "").trim();
  const lastName = String(check?.patient?.lastName || "").trim();
  const fallback = `${firstName} ${lastName}`.trim();
  if (!fallback && strict) {
    throw new AppError("Chekda bemor ma'lumoti topilmadi", 400);
  }

  return fallback || "-";
};

const tryResolveSpecialistId = async ({ specialistType, specialistName }) => {
  const safeType = normalizeSpecialistType(specialistType);
  const safeName = String(specialistName || "").trim();
  if (!safeName) return undefined;

  const specialist = await CashierSpecialist.findOne({ type: safeType, name: safeName });
  return specialist?._id;
};

const createEntryFromCheck = async ({ payload, user }) => {
  const checkObjectId = normalizeCheckObjectId(payload.checkRef);
  const check = await Check.findById(checkObjectId).lean();

  if (!check) {
    throw new AppError("Chek topilmadi", 404);
  }

  const creatorRole = String(check?.createdBy?.role || "").trim().toLowerCase();
  if (!CHECK_CREATOR_ROLES.includes(creatorRole)) {
    throw new AppError("Faqat nurse yoki lor yaratgan chek kassada qabul qilinadi", 400);
  }

  const existingEntry = await CashierEntry.findOne({ checkRef: check._id }).lean();
  if (existingEntry) {
    throw new AppError("Bu chek allaqachon kassada qabul qilingan", 400);
  }

  const amount = validateAmount(check.total);
  const { paidAmount, debtAmount } = resolvePaidAndDebt(amount, payload.paidAmount);
  const paymentMethod = normalizePaymentMethod(payload.paymentMethod);
  const patientName = resolvePatientNameFromCheck(check);
  const specialistName = String(check?.createdBy?.name || "").trim();

  if (!specialistName) {
    throw new AppError("Chek yaratuvchisi ma'lumoti topilmadi", 400);
  }

  const specialistId = await tryResolveSpecialistId({
    specialistType: creatorRole,
    specialistName
  });

  return CashierEntry.create({
    source: "check",
    checkRef: check._id,
    checkCode: String(check.checkId || "").trim(),
    department: creatorRole,
    patientName,
    amount,
    paidAmount,
    debtAmount,
    paymentMethod,
    specialistType: creatorRole,
    specialistName,
    ...(specialistId ? { specialistId } : {}),
    patientPhone: String(payload.patientPhone || "").trim(),
    note: String(payload.note || "").trim(),
    entryDate: new Date(),
    createdBy: {
      userId: user._id,
      role: user.role,
      name: user.name
    }
  });
};

const getPendingChecks = async ({ user, role = "all", search = "" }) => {
  assertCashierReadPermission(user);

  const safeRole = normalizeCheckCreatorRole(role, { allowAll: true });
  const safeSearch = String(search || "").trim();
  const filter = {
    "createdBy.role": safeRole === "all" ? { $in: CHECK_CREATOR_ROLES } : safeRole
  };

  if (safeSearch) {
    const regex = new RegExp(escapeRegex(safeSearch), "i");
    filter.$or = [
      { checkId: regex },
      { "patient.fullName": regex },
      { "patient.firstName": regex },
      { "patient.lastName": regex },
      { "createdBy.name": regex }
    ];
  }

  const checks = await Check.find(filter).sort({ createdAt: -1 }).lean();
  if (!checks.length) {
    return [];
  }

  const checkIds = checks.map((item) => item._id);
  const acceptedRows = await CashierEntry.find({ checkRef: { $in: checkIds } })
    .select("checkRef")
    .lean();
  const acceptedSet = new Set(
    acceptedRows
      .map((row) => String(row?.checkRef || ""))
      .filter(Boolean)
  );

  return checks
    .filter((check) => !acceptedSet.has(String(check._id)))
    .map((check) => ({
      _id: check._id,
      checkId: check.checkId,
      creatorRole: check.createdBy?.role || "",
      creatorName: check.createdBy?.name || "-",
      lorIdentity: check.createdBy?.lorIdentity || "",
      patientName: resolvePatientNameFromCheck(check, { strict: false }),
      total: Number(check.total || 0),
      createdAt: check.createdAt,
      itemsCount: Array.isArray(check.items) ? check.items.length : 0
    }));
};

const getEntries = async ({
  user,
  date,
  department,
  specialistType,
  paymentMethod,
  debtOnly,
  search,
  timeScope
}) => {
  assertCashierReadPermission(user);

  const {
    filter,
    safeDateString,
    safeDepartment,
    safeSpecialistType,
    safePaymentMethod,
    safeDebtOnly,
    safeTimeScope,
    shiftStart,
    shiftEnd
  } = buildListFilter({
    date,
    department,
    specialistType,
    paymentMethod,
    debtOnly,
    search,
    timeScope
  });

  const entries = await CashierEntry.find(filter).sort(
    safeTimeScope === "history"
      ? { entryDate: -1, createdAt: -1 }
      : { entryDate: 1, createdAt: 1 }
  );
  return {
    date: safeDateString,
    department: safeDepartment,
    specialistType: safeSpecialistType,
    paymentMethod: safePaymentMethod,
    debtOnly: safeDebtOnly === "true" || safeDebtOnly === "1",
    timeScope: safeTimeScope,
    shift: {
      start: shiftStart.toISOString(),
      end: shiftEnd.toISOString(),
      fromLabel: SHIFT_LABEL_FROM,
      toLabel: SHIFT_LABEL_TO
    },
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
  search,
  timeScope
}) => {
  assertCashierReadPermission(user);

  const {
    filter,
    safeDateString,
    safeDepartment,
    safeSpecialistType,
    safePaymentMethod,
    safeDebtOnly,
    safeTimeScope,
    shiftStart,
    shiftEnd
  } = buildListFilter({
    date,
    department,
    specialistType,
    paymentMethod,
    debtOnly,
    search,
    timeScope
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
    nurse: { totalAmount: 0, totalPaidAmount: 0, totalDebtAmount: 0, count: 0 }
  };
  const bySpecialistType = {
    nurse: { totalAmount: 0, totalPaidAmount: 0, totalDebtAmount: 0, count: 0 },
    lor: { totalAmount: 0, totalPaidAmount: 0, totalDebtAmount: 0, count: 0 }
  };

  for (const item of summary?.byDepartment || []) {
    const key = item?._id === "procedure" ? "nurse" : item?._id;
    if (key && byDepartment[key]) {
      byDepartment[key] = {
        totalAmount:
          byDepartment[key].totalAmount + Number(item.totalAmount || 0),
        totalPaidAmount:
          byDepartment[key].totalPaidAmount + Number(item.totalPaidAmount || 0),
        totalDebtAmount:
          byDepartment[key].totalDebtAmount + Number(item.totalDebtAmount || 0),
        count: byDepartment[key].count + Number(item.count || 0)
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
    timeScope: safeTimeScope,
    shift: {
      start: shiftStart.toISOString(),
      end: shiftEnd.toISOString(),
      fromLabel: SHIFT_LABEL_FROM,
      toLabel: SHIFT_LABEL_TO
    },
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
    throw new AppError("Mutaxassis nomi majburiy", 400);
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
    throw new AppError("Mutaxassis topilmadi", 404);
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

  if (!payload?.checkRef) {
    throw new AppError(
      "Kassir qo'lda yangi yozuv qo'sha olmaydi. Faqat yuborilgan chekni qabul qiling",
      400
    );
  }

  return createEntryFromCheck({ payload, user });
};

const updateEntry = async ({ entryId, payload, user }) => {
  assertCashierWritePermission(user);

  const entry = await CashierEntry.findById(entryId);
  if (!entry) {
    throw new AppError("Kassa yozuvi topilmadi", 404);
  }

  if (payload.patientName !== undefined) {
    const patientName = String(payload.patientName || "").trim();
    if (!patientName) {
      throw new AppError("Bemor F.I.O majburiy", 400);
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
  } else if (entry.department === "procedure") {
    // Backward compatibility: migrate procedure -> nurse on first update.
    entry.department = "nurse";
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
  } else if (!entry.paymentMethod || !PAYMENT_METHODS.includes(entry.paymentMethod)) {
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
    throw new AppError("Kassa yozuvi topilmadi", 404);
  }

  await CashierEntry.deleteOne({ _id: entryId });
  return { deleted: true, id: entryId };
};

module.exports = {
  getEntries,
  getSummary,
  getPendingChecks,
  getSpecialists,
  createSpecialist,
  deleteSpecialist,
  createEntry,
  updateEntry,
  deleteEntry
};
