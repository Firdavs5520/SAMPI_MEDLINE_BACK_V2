const Check = require("../models/Check");
const Medicine = require("../models/Medicine");
const MedicineUsage = require("../models/MedicineUsage");
const ServiceUsage = require("../models/ServiceUsage");
const CashierEntry = require("../models/CashierEntry");
const { getMonitoringOverview } = require("./monitoringService");
const cashierSettingsService = require("./cashierSettingsService");
const { buildCollectionStages } = require("./cashierCollections");
const AppError = require("../utils/AppError");
const mongoose = require("mongoose");
const STAFF_ROLES = ["nurse", "lor"];
const TASHKENT_OFFSET_HOURS = 5;
const TASHKENT_OFFSET_MS = TASHKENT_OFFSET_HOURS * 60 * 60 * 1000;

const getNowInTashkent = (nowUtc = new Date()) => new Date(nowUtc.getTime() + TASHKENT_OFFSET_MS);
const toUtcFromTashkentDate = (dateInTashkentTime) =>
  new Date(dateInTashkentTime.getTime() - TASHKENT_OFFSET_MS);

const getTashkentDayStart = (dateInTashkentTime) =>
  new Date(
    Date.UTC(
      dateInTashkentTime.getUTCFullYear(),
      dateInTashkentTime.getUTCMonth(),
      dateInTashkentTime.getUTCDate(),
      0,
      0,
      0,
      0
    )
  );

const normalizeDateString = (value) => {
  const safe = String(value || "").trim();
  if (!safe) return getNowInTashkent(new Date()).toISOString().slice(0, 10);
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
      hour - TASHKENT_OFFSET_HOURS,
      minute,
      second,
      ms
    )
  );

const getShiftRange = async (dateString) => {
  const safeDateString = normalizeDateString(dateString);
  return cashierSettingsService.getShiftRange({
    dateString: safeDateString,
    dateParts: parseDateParts(safeDateString)
  });
};

const getAllChecks = async () => {
  return Check.find().sort({ createdAt: -1 }).limit(500);
};

const resolvePeriodRange = (period) => {
  const nowUtc = new Date();
  const nowInTashkent = getNowInTashkent(nowUtc);
  const safePeriod = String(period || "all").toLowerCase();

  if (safePeriod === "today") {
    const dayStartInTashkent = getTashkentDayStart(nowInTashkent);
    return { start: toUtcFromTashkentDate(dayStartInTashkent), end: nowUtc };
  }

  if (safePeriod === "week") {
    const weekStartInTashkent = getTashkentDayStart(nowInTashkent);
    weekStartInTashkent.setUTCDate(weekStartInTashkent.getUTCDate() - 6);
    return { start: toUtcFromTashkentDate(weekStartInTashkent), end: nowUtc };
  }

  if (safePeriod === "month") {
    const monthStartInTashkent = new Date(nowInTashkent);
    monthStartInTashkent.setUTCMonth(monthStartInTashkent.getUTCMonth() - 1);
    monthStartInTashkent.setUTCHours(0, 0, 0, 0);
    return { start: toUtcFromTashkentDate(monthStartInTashkent), end: nowUtc };
  }

  return null;
};

const toRangeMatch = (range, fieldName) =>
  range ? { [fieldName]: { $gte: range.start, $lte: range.end } } : {};

const sumCollections = async (range, extraStages = []) => {
  const [result] = await CashierEntry.aggregate([
    ...buildCollectionStages(range),
    ...extraStages,
    { $group: { _id: null, total: { $sum: "$collections.amount" } } }
  ]);

  return Number(result?.total || 0);
};

const getTotalRevenue = async ({ period = "all" } = {}) => {
  const range = resolvePeriodRange(period);
  const entryMatch = toRangeMatch(range, "entryDate");
  const [totalRevenue, checksCount] = await Promise.all([
    sumCollections(range),
    CashierEntry.countDocuments(entryMatch)
  ]);

  return {
    totalRevenue,
    checksCount,
    period: String(period || "all").toLowerCase()
  };
};

const effectiveCashierRoleExpression = {
  $cond: [
    { $in: ["$checkCreatorRole", STAFF_ROLES] },
    "$checkCreatorRole",
    {
      $cond: [
        { $in: ["$specialistType", STAFF_ROLES] },
        "$specialistType",
        {
          $cond: [{ $eq: ["$department", "procedure"] }, "nurse", "$department"]
        }
      ]
    }
  ]
};

const buildCashierRoleStages = (periodMatch, role) => [
  ...(Object.keys(periodMatch).length > 0 ? [{ $match: periodMatch }] : []),
  {
    $addFields: {
      effectiveRole: effectiveCashierRoleExpression
    }
  },
  {
    $match: {
      effectiveRole: role || { $in: STAFF_ROLES }
    }
  }
];

const aggregateRevenueAndChecks = async (periodRange, role) => {
  const [totalRevenue, [countResult]] = await Promise.all([
    sumCollections(periodRange, buildCashierRoleStages({}, role)),
    CashierEntry.aggregate([
      ...buildCashierRoleStages(toRangeMatch(periodRange, "entryDate"), role),
      { $count: "checksCount" }
    ])
  ]);

  return {
    totalRevenue,
    checksCount: countResult?.checksCount || 0
  };
};

const aggregateTopItem = async (periodMatch, role) => {
  const [topItem] = await CashierEntry.aggregate([
    ...buildCashierRoleStages(periodMatch, role),
    { $match: { checkRef: { $ne: null } } },
    {
      $lookup: {
        from: "checks",
        localField: "checkRef",
        foreignField: "_id",
        as: "check"
      }
    },
    { $unwind: "$check" },
    { $unwind: "$check.items" },
    {
      $group: {
        _id: {
          itemType: "$check.items.itemType",
          name: "$check.items.name"
        },
        totalQuantity: { $sum: "$check.items.quantity" },
        checksCount: { $sum: 1 },
        totalRevenue: {
          $sum: { $multiply: ["$check.items.quantity", "$check.items.price"] }
        }
      }
    },
    { $sort: { totalQuantity: -1, checksCount: -1, "_id.name": 1 } },
    { $limit: 1 },
    {
      $project: {
        _id: 0,
        itemType: "$_id.itemType",
        name: "$_id.name",
        totalQuantity: 1,
        checksCount: 1,
        totalRevenue: 1
      }
    }
  ]);

  if (!topItem) return null;
  return topItem;
};

const aggregateMedicineTypesFromChecks = async (periodMatch, role) => {
  const [result] = await CashierEntry.aggregate([
    ...buildCashierRoleStages(periodMatch, role),
    { $match: { checkRef: { $ne: null } } },
    {
      $lookup: {
        from: "checks",
        localField: "checkRef",
        foreignField: "_id",
        as: "check"
      }
    },
    { $unwind: "$check" },
    { $unwind: "$check.items" },
    { $match: { "check.items.itemType": "medicine" } },
    { $group: { _id: "$check.items.name" } },
    { $count: "count" }
  ]);

  return result?.count || 0;
};

const aggregateLorIdentityStats = async (periodRange) => {
  const [revenueRows, countRows] = await Promise.all([
    CashierEntry.aggregate([
      ...buildCollectionStages(periodRange),
      ...buildCashierRoleStages({}, "lor"),
      {
        $group: {
          _id: "$checkLorIdentity",
          totalRevenue: { $sum: "$collections.amount" }
        }
      }
    ]),
    CashierEntry.aggregate([
      ...buildCashierRoleStages(toRangeMatch(periodRange, "entryDate"), "lor"),
      {
        $group: {
          _id: "$checkLorIdentity",
          checksCount: { $sum: 1 }
        }
      }
    ])
  ]);

  const findRow = (rows) => rows.find((item) => String(item?._id || "").toLowerCase() === "lor1");

  return {
    lor1: {
      totalRevenue: Number(findRow(revenueRows)?.totalRevenue || 0),
      checksCount: Number(findRow(countRows)?.checksCount || 0)
    }
  };
};

const buildRoleOverview = async (periodRange, role) => {
  const periodMatch = toRangeMatch(periodRange, "entryDate");
  const [summary, topItem, medicineTypesCount] = await Promise.all([
    aggregateRevenueAndChecks(periodRange, role),
    aggregateTopItem(periodMatch, role),
    aggregateMedicineTypesFromChecks(periodMatch, role)
  ]);

  return {
    ...summary,
    medicineTypesCount,
    topItem
  };
};

const getManagerOverview = async ({ period = "all" } = {}) => {
  const safePeriod = String(period || "all").toLowerCase();
  const periodRange = resolvePeriodRange(safePeriod);

  const [inventoryMedicineTypes, nurse, lor, total, lorIdentities] = await Promise.all([
    Medicine.countDocuments({ isArchived: { $ne: true } }),
    buildRoleOverview(periodRange, "nurse"),
    buildRoleOverview(periodRange, "lor"),
    buildRoleOverview(periodRange, null),
    aggregateLorIdentityStats(periodRange)
  ]);

  return {
    period: safePeriod,
    inventoryMedicineTypes,
    roles: {
      nurse,
      lor
    },
    total,
    lorIdentities
  };
};

const normalizeListLimit = (value, fallback = 300, max = 1000) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, Math.max(1, Math.floor(parsed)));
};

const getMedicineUsageHistory = async ({ limit } = {}) => {
  const safeLimit = normalizeListLimit(limit);
  return MedicineUsage.find()
    .populate("medicineId", "name")
    .populate("usedBy", "name role email")
    .sort({ usedAt: -1 })
    .limit(safeLimit);
};

const getCurrentStock = async () => {
  return Medicine.find({ isArchived: { $ne: true } })
    .select("name stock createdAt")
    .sort({ name: 1 });
};

const getMostUsedMedicines = async (limit = 10) => {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 10;

  return MedicineUsage.aggregate([
    {
      $group: {
        _id: "$medicineId",
        totalUsedQuantity: { $sum: "$quantity" },
        usageCount: { $sum: 1 }
      }
    },
    {
      $lookup: {
        from: "medicines",
        localField: "_id",
        foreignField: "_id",
        as: "medicine"
      }
    },
    {
      $unwind: "$medicine"
    },
    {
      $project: {
        _id: 0,
        medicineId: "$medicine._id",
        medicineName: "$medicine.name",
        totalUsedQuantity: 1,
        usageCount: 1
      }
    },
    {
      $sort: {
        totalUsedQuantity: -1
      }
    },
    {
      $limit: safeLimit
    }
  ]);
};

const aggregateShiftCollections = async ({ start, end }) => {
  const [result] = await CashierEntry.aggregate([
    ...buildCollectionStages({ start, end }),
    {
      $facet: {
        overall: [
          {
            $group: {
              _id: null,
              collectedAmount: { $sum: "$collections.amount" },
              debtRepaymentAmount: {
                $sum: {
                  $cond: [{ $lt: ["$entryDate", start] }, "$collections.amount", 0]
                }
              }
            }
          }
        ],
        byPaymentMethod: [
          {
            $group: {
              _id: "$collections.paymentMethod",
              collectedAmount: { $sum: "$collections.amount" }
            }
          }
        ]
      }
    }
  ]);

  return {
    collectedAmount: Number(result?.overall?.[0]?.collectedAmount || 0),
    debtRepaymentAmount: Number(result?.overall?.[0]?.debtRepaymentAmount || 0),
    byPaymentMethod: new Map(
      (result?.byPaymentMethod || []).map((item) => [item._id, Number(item.collectedAmount || 0)])
    )
  };
};

const mergePaymentMethodRows = (entryRows, collectedByMethod) => {
  const rowsByMethod = new Map();

  for (const item of entryRows) {
    rowsByMethod.set(item._id, {
      paymentMethod: item._id,
      totalAmount: Number(item.totalAmount || 0),
      totalPaidAmount: 0,
      totalDebtAmount: Number(item.totalDebtAmount || 0),
      entriesCount: Number(item.entriesCount || 0)
    });
  }

  for (const [paymentMethod, collectedAmount] of collectedByMethod) {
    const row = rowsByMethod.get(paymentMethod) || {
      paymentMethod,
      totalAmount: 0,
      totalPaidAmount: 0,
      totalDebtAmount: 0,
      entriesCount: 0
    };
    row.totalPaidAmount = collectedAmount;
    rowsByMethod.set(paymentMethod, row);
  }

  return Array.from(rowsByMethod.values()).sort((a, b) =>
    String(a.paymentMethod).localeCompare(String(b.paymentMethod))
  );
};

const getShiftCloseReport = async ({ date } = {}) => {
  const requestedDate = String(date || "").trim()
    ? date
    : await cashierSettingsService.getCurrentShiftDate();
  const { safeDateString, start, end, fromLabel, toLabel, settings } =
    await getShiftRange(requestedDate);
  const collections = await aggregateShiftCollections({ start, end });

  const [summary] = await CashierEntry.aggregate([
    {
      $match: {
        entryDate: { $gte: start, $lte: end }
      }
    },
    {
      $facet: {
        overall: [
          {
            $group: {
              _id: null,
              totalAmount: { $sum: "$amount" },
              totalPaidAmount: { $sum: "$paidAmount" },
              totalDebtAmount: { $sum: "$debtAmount" },
              entriesCount: { $sum: 1 }
            }
          }
        ],
        byPaymentMethod: [
          {
            $group: {
              _id: "$paymentMethod",
              totalAmount: { $sum: "$amount" },
              totalPaidAmount: { $sum: "$paidAmount" },
              totalDebtAmount: { $sum: "$debtAmount" },
              entriesCount: { $sum: 1 }
            }
          },
          { $sort: { _id: 1 } }
        ],
        byDepartment: [
          {
            $group: {
              _id: "$department",
              totalAmount: { $sum: "$amount" },
              totalPaidAmount: { $sum: "$paidAmount" },
              totalDebtAmount: { $sum: "$debtAmount" },
              entriesCount: { $sum: 1 }
            }
          },
          { $sort: { _id: 1 } }
        ],
        topSpecialists: [
          {
            $group: {
              _id: {
                specialistName: "$specialistName",
                specialistType: "$specialistType"
              },
              totalAmount: { $sum: "$amount" },
              checksCount: { $sum: 1 }
            }
          },
          { $sort: { totalAmount: -1, checksCount: -1, "_id.specialistName": 1 } },
          { $limit: 10 },
          {
            $project: {
              _id: 0,
              specialistName: "$_id.specialistName",
              specialistType: "$_id.specialistType",
              totalAmount: 1,
              checksCount: 1
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
    entriesCount: 0
  };

  return {
    date: safeDateString,
    shift: {
      fromLabel,
      toLabel,
      start: start.toISOString(),
      end: end.toISOString(),
      settings
    },
    totals: {
      totalAmount: Number(overall.totalAmount || 0),
      // Smena davomida kassaga haqiqatda tushgan pul (eski qarzlar to'lovi bilan).
      totalPaidAmount: collections.collectedAmount,
      debtRepaymentAmount: collections.debtRepaymentAmount,
      totalDebtAmount: Number(overall.totalDebtAmount || 0),
      entriesCount: Number(overall.entriesCount || 0)
    },
    byPaymentMethod: mergePaymentMethodRows(
      summary?.byPaymentMethod || [],
      collections.byPaymentMethod
    ),
    byDepartment: (summary?.byDepartment || []).map((item) => ({
      department: item._id,
      totalAmount: Number(item.totalAmount || 0),
      totalPaidAmount: Number(item.totalPaidAmount || 0),
      totalDebtAmount: Number(item.totalDebtAmount || 0),
      entriesCount: Number(item.entriesCount || 0)
    })),
    topSpecialists: summary?.topSpecialists || []
  };
};

const getTodayRangeInTashkent = () => {
  const nowUtc = new Date();
  const nowInTashkent = getNowInTashkent(nowUtc);
  const dayStartInTashkent = getTashkentDayStart(nowInTashkent);
  const startUtc = toUtcFromTashkentDate(dayStartInTashkent);
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000 - 1);

  return {
    dateLabel: nowInTashkent.toISOString().slice(0, 10),
    startUtc,
    endUtc
  };
};

const resetTodayOperationalData = async ({ confirm }) => {
  if (String(confirm || "").trim() !== "RESET_TODAY") {
    throw new AppError("Tasdiqlash uchun confirm=RESET_TODAY yuboring", 400);
  }

  const { dateLabel, startUtc, endUtc } = getTodayRangeInTashkent();
  const session = await mongoose.startSession();

  let result = null;

  try {
    await session.withTransaction(async () => {
      const medUsageAgg = await MedicineUsage.aggregate([
        {
          $match: {
            usedAt: { $gte: startUtc, $lte: endUtc }
          }
        },
        {
          $group: {
            _id: "$medicineId",
            totalQty: { $sum: "$quantity" },
            usageCount: { $sum: 1 }
          }
        }
      ]).session(session);

      const stockRestoreOps = medUsageAgg
        .filter((row) => row?._id && Number(row.totalQty) > 0)
        .map((row) => ({
          updateOne: {
            filter: { _id: row._id },
            update: { $inc: { stock: Number(row.totalQty) } }
          }
        }));

      let restoredMedicineStocks = 0;
      if (stockRestoreOps.length > 0) {
        const restoreRes = await Medicine.bulkWrite(stockRestoreOps, { session });
        restoredMedicineStocks = Number(restoreRes.modifiedCount || 0);
      }

      const medUsageDelete = await MedicineUsage.deleteMany(
        { usedAt: { $gte: startUtc, $lte: endUtc } },
        { session }
      );

      const serviceUsageDelete = await ServiceUsage.deleteMany(
        { usedAt: { $gte: startUtc, $lte: endUtc } },
        { session }
      );

      const cashierEntriesDelete = await CashierEntry.deleteMany(
        {
          $or: [
            { entryDate: { $gte: startUtc, $lte: endUtc } },
            { createdAt: { $gte: startUtc, $lte: endUtc } }
          ]
        },
        { session }
      );

      // Check model delete middleware blocks deleteMany, so use native collection API.
      const checksDelete = await Check.collection.deleteMany(
        { createdAt: { $gte: startUtc, $lte: endUtc } },
        { session }
      );

      result = {
        timezone: "Asia/Tashkent",
        date: dateLabel,
        startUtc: startUtc.toISOString(),
        endUtc: endUtc.toISOString(),
        restoredMedicineStocks,
        medicineUsageDeleted: Number(medUsageDelete.deletedCount || 0),
        serviceUsageDeleted: Number(serviceUsageDelete.deletedCount || 0),
        cashierEntriesDeleted: Number(cashierEntriesDelete.deletedCount || 0),
        checksDeleted: Number(checksDelete.deletedCount || 0)
      };
    });
  } finally {
    await session.endSession();
  }

  return result;
};

const resetAllOperationalData = async ({ confirm }) => {
  if (String(confirm || "").trim() !== "RESET_OPERATIONAL_DATA") {
    throw new AppError("Tasdiqlash uchun confirm=RESET_OPERATIONAL_DATA yuboring", 400);
  }

  const session = await mongoose.startSession();
  let result = null;

  try {
    await session.withTransaction(async () => {
      const medUsageAgg = await MedicineUsage.aggregate([
        {
          $group: {
            _id: "$medicineId",
            totalQty: { $sum: "$quantity" },
            usageCount: { $sum: 1 }
          }
        }
      ]).session(session);

      const stockRestoreOps = medUsageAgg
        .filter((row) => row?._id && Number(row.totalQty) > 0)
        .map((row) => ({
          updateOne: {
            filter: { _id: row._id },
            update: { $inc: { stock: Number(row.totalQty) } }
          }
        }));

      let restoredMedicineStocks = 0;
      if (stockRestoreOps.length > 0) {
        const restoreRes = await Medicine.bulkWrite(stockRestoreOps, { session });
        restoredMedicineStocks = Number(restoreRes.modifiedCount || 0);
      }

      const medUsageDelete = await MedicineUsage.deleteMany({}, { session });
      const serviceUsageDelete = await ServiceUsage.deleteMany({}, { session });
      const cashierEntriesDelete = await CashierEntry.deleteMany({}, { session });

      // Check model delete middleware blocks deleteMany, so use native collection API.
      const checksDelete = await Check.collection.deleteMany({}, { session });

      result = {
        scope: "all-operational-data",
        preserved: ["users", "medicines", "services", "cashierSpecialists"],
        restoredMedicineStocks,
        medicineUsageDeleted: Number(medUsageDelete.deletedCount || 0),
        serviceUsageDeleted: Number(serviceUsageDelete.deletedCount || 0),
        cashierEntriesDeleted: Number(cashierEntriesDelete.deletedCount || 0),
        checksDeleted: Number(checksDelete.deletedCount || 0)
      };
    });
  } finally {
    await session.endSession();
  }

  return result;
};

module.exports = {
  getAllChecks,
  getTotalRevenue,
  getManagerOverview,
  getMedicineUsageHistory,
  getCurrentStock,
  getMostUsedMedicines,
  getShiftCloseReport,
  resetTodayOperationalData,
  resetAllOperationalData,
  getMonitoringOverview
};
