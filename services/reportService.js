const Check = require("../models/Check");
const Medicine = require("../models/Medicine");
const MedicineUsage = require("../models/MedicineUsage");
const STAFF_ROLES = ["nurse", "lor"];

const getAllChecks = async () => {
  return Check.find().sort({ createdAt: -1 });
};

const resolveRevenueMatch = (period) => {
  const now = new Date();
  const safePeriod = String(period || "all").toLowerCase();

  if (safePeriod === "today") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { createdAt: { $gte: start, $lte: now } };
  }

  if (safePeriod === "week") {
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return { createdAt: { $gte: start, $lte: now } };
  }

  if (safePeriod === "month") {
    const start = new Date(now);
    start.setMonth(now.getMonth() - 1);
    start.setHours(0, 0, 0, 0);
    return { createdAt: { $gte: start, $lte: now } };
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

  const [inventoryMedicineTypes, nurse, lor, total] = await Promise.all([
    Medicine.countDocuments(),
    buildRoleOverview(periodMatch, "nurse"),
    buildRoleOverview(periodMatch, "lor"),
    buildRoleOverview(periodMatch, null)
  ]);

  return {
    period: safePeriod,
    inventoryMedicineTypes,
    roles: {
      nurse,
      lor
    },
    total
  };
};

const getMedicineUsageHistory = async () => {
  return MedicineUsage.find()
    .populate("medicineId", "name")
    .populate("usedBy", "name role email")
    .sort({ usedAt: -1 });
};

const getCurrentStock = async () => {
  return Medicine.find().select("name stock createdAt").sort({ name: 1 });
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
