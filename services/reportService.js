const Check = require("../models/Check");
const Medicine = require("../models/Medicine");
const MedicineUsage = require("../models/MedicineUsage");
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

module.exports = {
  getAllChecks,
  getTotalRevenue,
  getManagerOverview,
  getMedicineUsageHistory,
  getCurrentStock,
  getMostUsedMedicines
};
