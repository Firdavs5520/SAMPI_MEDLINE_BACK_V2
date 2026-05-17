const Check = require("../models/Check");
const Medicine = require("../models/Medicine");
const MedicineUsage = require("../models/MedicineUsage");
const ServiceUsage = require("../models/ServiceUsage");
const CashierEntry = require("../models/CashierEntry");
const { getMonitoringOverview } = require("./monitoringService");
const AppError = require("../utils/AppError");
const mongoose = require("mongoose");
const STAFF_ROLES = ["nurse", "lor"];
const TASHKENT_OFFSET_HOURS = 5;
const TASHKENT_OFFSET_MS = TASHKENT_OFFSET_HOURS * 60 * 60 * 1000;
const SHIFT_START_HOUR = 8;
const SHIFT_END_HOUR = 2;

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

  return {
    safeDateString,
    start,
    end: new Date(endBoundary.getTime() - 1)
  };
};

const getAllChecks = async () => {
  return Check.find().sort({ createdAt: -1 });
};

const resolveRevenueMatch = (period) => {
  const nowUtc = new Date();
  const nowInTashkent = getNowInTashkent(nowUtc);
  const safePeriod = String(period || "all").toLowerCase();

  if (safePeriod === "today") {
    const dayStartInTashkent = getTashkentDayStart(nowInTashkent);
    const startUtc = toUtcFromTashkentDate(dayStartInTashkent);
    return { createdAt: { $gte: startUtc, $lte: nowUtc } };
  }

  if (safePeriod === "week") {
    const weekStartInTashkent = getTashkentDayStart(nowInTashkent);
    weekStartInTashkent.setUTCDate(weekStartInTashkent.getUTCDate() - 6);
    const startUtc = toUtcFromTashkentDate(weekStartInTashkent);
    return { createdAt: { $gte: startUtc, $lte: nowUtc } };
  }

  if (safePeriod === "month") {
    const monthStartInTashkent = new Date(nowInTashkent);
    monthStartInTashkent.setUTCMonth(monthStartInTashkent.getUTCMonth() - 1);
    monthStartInTashkent.setUTCHours(0, 0, 0, 0);
    const startUtc = toUtcFromTashkentDate(monthStartInTashkent);
    return { createdAt: { $gte: startUtc, $lte: nowUtc } };
  }

  return {};
};

const getTotalRevenue = async ({ period = "all" } = {}) => {
  const match = resolveRevenueMatch(period);
  const pipeline = [];

  if (Object.keys(match).length > 0) {
    pipeline.push({ $match: match });
  }

  pipeline.push({
    $group: {
      _id: null,
      totalRevenue: { $sum: "$total" },
      checksCount: { $sum: 1 }
    }
  });

  const [result] = await Check.aggregate(pipeline);

  return {
    totalRevenue: result?.totalRevenue || 0,
    checksCount: result?.checksCount || 0,
    period: String(period || "all").toLowerCase()
  };
};

const mergeMatch = (periodMatch, role) => {
  const match = {
    ...periodMatch
  };

  if (role) {
    match["createdBy.role"] = role;
  } else {
    match["createdBy.role"] = { $in: STAFF_ROLES };
  }

  return match;
};

const aggregateRevenueAndChecks = async (match) => {
  const [result] = await Check.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: "$total" },
        checksCount: { $sum: 1 }
      }
    }
  ]);

  return {
    totalRevenue: result?.totalRevenue || 0,
    checksCount: result?.checksCount || 0
  };
};

const aggregateTopItem = async (match) => {
  const [topItem] = await Check.aggregate([
    { $match: match },
    { $unwind: "$items" },
    {
      $group: {
        _id: {
          itemType: "$items.itemType",
          name: "$items.name"
        },
        totalQuantity: { $sum: "$items.quantity" },
        checksCount: { $sum: 1 },
        totalRevenue: {
          $sum: { $multiply: ["$items.quantity", "$items.price"] }
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

const aggregateMedicineTypesFromChecks = async (match) => {
  const [result] = await Check.aggregate([
    { $match: match },
    { $unwind: "$items" },
    { $match: { "items.itemType": "medicine" } },
    { $group: { _id: "$items.name" } },
    { $count: "count" }
  ]);

  return result?.count || 0;
};

const aggregateLorIdentityStats = async (periodMatch) => {
  const groupedRows = await Check.aggregate([
    {
      $match: {
        ...periodMatch,
        "createdBy.role": "lor"
      }
    },
    {
      $group: {
        _id: "$createdBy.lorIdentity",
        totalRevenue: { $sum: "$total" },
        checksCount: { $sum: 1 }
      }
    }
  ]);

  const stats = {
    lor1: { totalRevenue: 0, checksCount: 0 },
    lor2: { totalRevenue: 0, checksCount: 0 }
  };

  for (const item of groupedRows) {
    const key = String(item?._id || "").toLowerCase();
    if (key === "lor1" || key === "lor2") {
      stats[key] = {
        totalRevenue: Number(item.totalRevenue || 0),
        checksCount: Number(item.checksCount || 0)
      };
    }
  }

  return stats;
};

const buildRoleOverview = async (periodMatch, role) => {
  const match = mergeMatch(periodMatch, role);

  const [summary, topItem, medicineTypesCount] = await Promise.all([
    aggregateRevenueAndChecks(match),
    aggregateTopItem(match),
    aggregateMedicineTypesFromChecks(match)
  ]);

  return {
    ...summary,
    medicineTypesCount,
    topItem
  };
};

const getManagerOverview = async ({ period = "all" } = {}) => {
  const safePeriod = String(period || "all").toLowerCase();
  const periodMatch = resolveRevenueMatch(safePeriod);

  const [inventoryMedicineTypes, nurse, lor, total, lorIdentities] = await Promise.all([
    Medicine.countDocuments({ isArchived: { $ne: true } }),
    buildRoleOverview(periodMatch, "nurse"),
    buildRoleOverview(periodMatch, "lor"),
    buildRoleOverview(periodMatch, null),
    aggregateLorIdentityStats(periodMatch)
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

const getMedicineUsageHistory = async () => {
  return MedicineUsage.find()
    .populate("medicineId", "name")
    .populate("usedBy", "name role email")
    .sort({ usedAt: -1 });
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

const getShiftCloseReport = async ({ date } = {}) => {
  const { safeDateString, start, end } = getShiftRange(date);

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
      fromLabel: "08:00",
      toLabel: "02:00",
      start: start.toISOString(),
      end: end.toISOString()
    },
    totals: {
      totalAmount: Number(overall.totalAmount || 0),
      totalPaidAmount: Number(overall.totalPaidAmount || 0),
      totalDebtAmount: Number(overall.totalDebtAmount || 0),
      entriesCount: Number(overall.entriesCount || 0)
    },
    byPaymentMethod: (summary?.byPaymentMethod || []).map((item) => ({
      paymentMethod: item._id,
      totalAmount: Number(item.totalAmount || 0),
      totalPaidAmount: Number(item.totalPaidAmount || 0),
      totalDebtAmount: Number(item.totalDebtAmount || 0),
      entriesCount: Number(item.entriesCount || 0)
    })),
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

module.exports = {
  getAllChecks,
  getTotalRevenue,
  getManagerOverview,
  getMedicineUsageHistory,
  getCurrentStock,
  getMostUsedMedicines,
  getShiftCloseReport,
  resetTodayOperationalData,
  getMonitoringOverview
};
