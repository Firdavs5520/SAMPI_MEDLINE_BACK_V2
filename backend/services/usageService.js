const crypto = require("crypto");
const mongoose = require("mongoose");
const Medicine = require("../models/Medicine");
const Service = require("../models/Service");
const Check = require("../models/Check");
const MedicineUsage = require("../models/MedicineUsage");
const ServiceUsage = require("../models/ServiceUsage");
const AppError = require("../utils/AppError");
const NURSE_PRICE_TIERS = ["first", "second", "third"];
const SERVICE_PRICE_TIER_LABELS = {
  first: "1-marta",
  second: "2-marta",
  third: "3-marta"
};

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const assertObjectId = (value, label) => {
  if (!isValidObjectId(value)) {
    throw new AppError(`${label} noto'g'ri`, 400);
  }
};

const safeAbortTransaction = async (session) => {
  if (!session) return;

  try {
    if (typeof session.inTransaction === "function" && session.inTransaction()) {
      await session.abortTransaction();
    }
  } catch (_) {
    // Intentionally ignore abort errors to preserve original business error.
  }
};

const validateQuantity = (quantity) => {
  if (typeof quantity !== "number" || quantity <= 0) {
    throw new AppError("Miqdor 0 dan katta bo'lishi kerak", 400);
  }
};

const resolvePrice = (basePrice, label = "Item") => {
  const fallback = Number(basePrice);
  if (!Number.isFinite(fallback) || fallback <= 0 || fallback >= 1000000) {
    throw new AppError(`${label} uchun saqlangan narx noto'g'ri`, 400);
  }

  return fallback;
};

const normalizePriceTier = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const normalized = String(value).trim().toLowerCase();
  if (!NURSE_PRICE_TIERS.includes(normalized)) {
    throw new AppError("Narx bosqichi first, second yoki third bo'lishi kerak", 400);
  }

  return normalized;
};

const resolveServicePrice = ({ service, priceTier, userRole }) => {
  const normalizedTier = normalizePriceTier(priceTier);
  const isNurseService = service?.type === "nurse";

  if (isNurseService && userRole === "nurse") {
    const targetTier = normalizedTier || "first";
    const optionPrice = Number(service?.priceOptions?.[targetTier]);

    if (Number.isFinite(optionPrice) && optionPrice > 0 && optionPrice < 1000000) {
      return {
        price: optionPrice,
        priceTier: targetTier,
        tierLabel: SERVICE_PRICE_TIER_LABELS[targetTier]
      };
    }
  }

  return {
    price: resolvePrice(service?.price, service?.name),
    priceTier: null,
    tierLabel: null
  };
};

const getServiceCheckItemName = (serviceName, tierLabel) => {
  if (!tierLabel) return serviceName;
  return `${serviceName} (${tierLabel})`;
};

const normalizePatient = (patient) => {
  const firstName = patient?.firstName?.trim?.() || "";
  const lastName = patient?.lastName?.trim?.() || "";

  if (!firstName || !lastName) {
    throw new AppError("Bemorning ismi va familiyasi majburiy", 400);
  }

  return {
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`.trim()
  };
};

const normalizeOptionalPatient = (patient) => {
  const firstName = patient?.firstName?.trim?.() || "";
  const lastName = patient?.lastName?.trim?.() || "";

  if (!firstName && !lastName) return null;
  if (!firstName || !lastName) {
    throw new AppError("Bemorning ismi va familiyasi majburiy", 400);
  }

  return {
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`.trim()
  };
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeLorIdentity = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  if (!normalized) {
    throw new AppError("LOR uchun lorIdentity majburiy", 400);
  }

  if (!["lor1", "lor2"].includes(normalized)) {
    throw new AppError("lorIdentity lor1 yoki lor2 bo'lishi kerak", 400);
  }

  return normalized;
};

const createUniqueCheckId = async (session) => {
  for (let i = 0; i < 5; i += 1) {
    const checkId = `CHK-${Date.now()}-${crypto
      .randomBytes(3)
      .toString("hex")
      .toUpperCase()}`;

    const exists = await Check.exists({ checkId }).session(session);
    if (!exists) return checkId;
  }

  throw new AppError("Yagona chek ID yaratib bo'lmadi", 500);
};

const buildCreatedByPayload = (user, options = {}) => {
  const payload = {
    userId: user._id,
    role: user.role,
    name: user.name
  };

  if (user.role === "lor" && options.lorIdentity) {
    payload.lorIdentity = options.lorIdentity;
    payload.name = `${user.name} (${options.lorIdentity.toUpperCase()})`;
  }

  return payload;
};

const assertUniqueIds = (items, key, message) => {
  const seen = new Set();
  for (const item of items) {
    if (!item?.[key]) {
      throw new AppError(`Yetishmayapti: ${key} so'rov elementida`, 400);
    }
    if (seen.has(item[key])) {
      throw new AppError(message, 400);
    }
    seen.add(item[key]);
  }
};

const resolveCheckType = (medicineCount, serviceCount) => {
  if (medicineCount > 0 && serviceCount > 0) return "mixed";
  if (medicineCount > 0) return "medicine";
  return "service";
};

const enforceServiceRoleRule = (service, userRole) => {
  if (userRole === "nurse" && service.type !== "nurse") {
    throw new AppError("Hamshira faqat nurse xizmatlaridan foydalana oladi", 403);
  }

  if (userRole === "lor" && service.type !== "lor") {
    throw new AppError("LOR faqat lor xizmatlaridan foydalana oladi", 403);
  }
};

const enforceLorServiceOwnership = (service, user) => {
  if (user.role !== "lor") return;

  const ownerId = service?.createdBy?.userId?.toString?.();
  const currentUserId = user?._id?.toString?.();

  // Legacy services (without createdBy) are allowed for LOR.
  if (!ownerId) return;

  if (ownerId !== currentUserId) {
    throw new AppError("LOR faqat o'zi qo'shgan xizmatlardan foydalana oladi", 403);
  }
};

const useMedicine = async ({ medicineId, quantity, user }) => {
  validateQuantity(quantity);
  assertObjectId(medicineId, "Dori ID");

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const medicine = await Medicine.findOneAndUpdate(
      { _id: medicineId, stock: { $gte: quantity }, isArchived: { $ne: true } },
      { $inc: { stock: -quantity } },
      { new: true, session }
    );

    if (!medicine) {
      throw new AppError("Qoldiq yetarli emas yoki dori topilmadi", 400);
    }

    const resolvedPrice = resolvePrice(medicine.price, medicine.name);

    const [usageRecord] = await MedicineUsage.create(
      [
        {
          medicineId,
          quantity,
          usedBy: user._id
        }
      ],
      { session }
    );

    const total = Number((quantity * resolvedPrice).toFixed(2));
    const checkId = await createUniqueCheckId(session);

    const [check] = await Check.create(
      [
        {
          checkId,
          type: "medicine",
          items: [
            {
              itemType: "medicine",
              name: medicine.name,
              quantity,
              price: resolvedPrice
            }
          ],
          total,
          createdBy: buildCreatedByPayload(user)
        }
      ],
      { session }
    );

    await session.commitTransaction();
    return { medicine, usage: usageRecord, check };
  } catch (error) {
    await safeAbortTransaction(session);
    throw error;
  } finally {
    session.endSession();
  }
};

const useService = async ({
  serviceId,
  quantity,
  priceTier,
  patient,
  lorIdentity,
  user
}) => {
  validateQuantity(quantity);
  assertObjectId(serviceId, "Xizmat ID");
  const normalizedPatient =
    user?.role === "lor" ? normalizePatient(patient) : normalizeOptionalPatient(patient);
  const normalizedLorIdentity =
    user?.role === "lor" ? normalizeLorIdentity(lorIdentity) : null;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const service = await Service.findById(serviceId).session(session);
    if (!service) {
      throw new AppError("Xizmat topilmadi", 404);
    }

    enforceServiceRoleRule(service, user.role);
    enforceLorServiceOwnership(service, user);

    const resolved = resolveServicePrice({
      service,
      priceTier,
      userRole: user.role
    });

    const [usageRecord] = await ServiceUsage.create(
      [
        {
          serviceId,
          quantity,
          usedBy: user._id,
          ...(resolved.priceTier ? { priceTier: resolved.priceTier } : {})
        }
      ],
      { session }
    );

    const total = Number((quantity * resolved.price).toFixed(2));
    const checkId = await createUniqueCheckId(session);

    const [check] = await Check.create(
      [
        {
          checkId,
          type: "service",
          items: [
            {
              itemType: "service",
              name: getServiceCheckItemName(service.name, resolved.tierLabel),
              quantity,
              price: resolved.price
            }
          ],
          total,
          ...(normalizedPatient ? { patient: normalizedPatient } : {}),
          createdBy: buildCreatedByPayload(user, {
            lorIdentity: normalizedLorIdentity
          })
        }
      ],
      { session }
    );

    await session.commitTransaction();
    return { service, usage: usageRecord, check };
  } catch (error) {
    await safeAbortTransaction(session);
    throw error;
  } finally {
    session.endSession();
  }
};

const getMyChecks = async ({ user, search = "", lorIdentity }) => {
  if (!user) {
    throw new AppError("Foydalanuvchi majburiy", 401);
  }

  const filter = {
    "createdBy.userId": user._id
  };

  if (user.role === "lor" && lorIdentity) {
    filter.$or = [
      { "createdBy.lorIdentity": normalizeLorIdentity(lorIdentity) },
      { "createdBy.lorIdentity": { $exists: false } }
    ];
  }

  const safeSearch = String(search || "").trim();
  if (safeSearch) {
    const pattern = escapeRegex(safeSearch);
    filter.$and = [
      ...(filter.$and || []),
      {
        $or: [
          { "patient.fullName": { $regex: pattern, $options: "i" } },
          { "patient.firstName": { $regex: pattern, $options: "i" } },
          { "patient.lastName": { $regex: pattern, $options: "i" } }
        ]
      }
    ];
  }

  return Check.find(filter).sort({ createdAt: -1 });
};

const createNurseCheckout = async ({ medicines = [], services = [], patient, user }) => {
  if (!user || user.role !== "nurse") {
    throw new AppError("Bu chekni faqat hamshira yaratishi mumkin", 403);
  }

  const medicineItems = Array.isArray(medicines) ? medicines : [];
  const serviceItems = Array.isArray(services) ? services : [];

  if (medicineItems.length === 0 && serviceItems.length === 0) {
    throw new AppError("Kamida bitta dori yoki xizmat tanlanishi kerak", 400);
  }

  assertUniqueIds(
    medicineItems,
    "medicineId",
    "Duplicate medicine is not allowed in one checkout"
  );
  assertUniqueIds(
    serviceItems,
    "serviceId",
    "Duplicate service is not allowed in one checkout"
  );

  const normalizedMedicineItems = medicineItems.map((item) => ({
    medicineId: item.medicineId,
    quantity: Number(item.quantity)
  }));
  const normalizedServiceItems = serviceItems.map((item) => ({
    serviceId: item.serviceId,
    quantity: Number(item.quantity),
    priceTier: item.priceTier
  }));

  normalizedMedicineItems.forEach((item) => assertObjectId(item.medicineId, "Dori ID"));
  normalizedServiceItems.forEach((item) => assertObjectId(item.serviceId, "Xizmat ID"));
  const normalizedPatient = normalizePatient(patient);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    let total = 0;
    const checkItems = [];
    const medicineUsageDocs = [];
    const serviceUsageDocs = [];

    const medicineIds = normalizedMedicineItems.map((item) => item.medicineId);
    const serviceIds = normalizedServiceItems.map((item) => item.serviceId);

    const medicineDocs = medicineIds.length
      ? await Medicine.find({
          _id: { $in: medicineIds },
          isArchived: { $ne: true }
        }).session(session)
      : [];

    const serviceDocs = serviceIds.length
      ? await Service.find({
          _id: { $in: serviceIds }
        }).session(session)
      : [];

    const medicineMap = new Map(
      medicineDocs.map((medicine) => [medicine._id.toString(), medicine])
    );
    const serviceMap = new Map(serviceDocs.map((service) => [service._id.toString(), service]));

    for (const item of normalizedMedicineItems) {
      const quantity = item.quantity;
      validateQuantity(quantity);

      const medicine = medicineMap.get(String(item.medicineId));

      if (!medicine) {
        throw new AppError("Qoldiq yetarli emas yoki dori topilmadi", 400);
      }
      if (medicine.stock < quantity) {
        throw new AppError("Qoldiq yetarli emas yoki dori topilmadi", 400);
      }

      const resolvedPrice = resolvePrice(medicine.price, medicine.name);

      medicineUsageDocs.push({
        medicineId: medicine._id,
        quantity,
        usedBy: user._id
      });

      checkItems.push({
        itemType: "medicine",
        name: medicine.name,
        quantity,
        price: resolvedPrice
      });

      total += quantity * resolvedPrice;
    }

    if (normalizedMedicineItems.length > 0) {
      const stockUpdateOps = normalizedMedicineItems.map((item) => ({
        updateOne: {
          filter: {
            _id: item.medicineId,
            stock: { $gte: item.quantity },
            isArchived: { $ne: true }
          },
          update: { $inc: { stock: -item.quantity } }
        }
      }));

      const stockUpdateResult = await Medicine.bulkWrite(stockUpdateOps, { session });
      if (stockUpdateResult.matchedCount !== stockUpdateOps.length) {
        throw new AppError("Qoldiq yetarli emas yoki dori topilmadi", 400);
      }
    }

    for (const item of normalizedServiceItems) {
      const quantity = item.quantity;
      validateQuantity(quantity);

      const service = serviceMap.get(String(item.serviceId));
      if (!service) {
        throw new AppError("Xizmat topilmadi", 404);
      }

      enforceServiceRoleRule(service, user.role);
      enforceLorServiceOwnership(service, user);

      const resolved = resolveServicePrice({
        service,
        priceTier: item.priceTier,
        userRole: user.role
      });

      serviceUsageDocs.push({
        serviceId: service._id,
        quantity,
        usedBy: user._id,
        ...(resolved.priceTier ? { priceTier: resolved.priceTier } : {})
      });

      checkItems.push({
        itemType: "service",
        name: getServiceCheckItemName(service.name, resolved.tierLabel),
        quantity,
        price: resolved.price
      });

      total += quantity * resolved.price;
    }

    if (medicineUsageDocs.length > 0) {
      await MedicineUsage.insertMany(medicineUsageDocs, { session });
    }

    if (serviceUsageDocs.length > 0) {
      await ServiceUsage.insertMany(serviceUsageDocs, { session });
    }

    const checkId = await createUniqueCheckId(session);

    const [check] = await Check.create(
      [
        {
          checkId,
          type: resolveCheckType(normalizedMedicineItems.length, normalizedServiceItems.length),
          items: checkItems,
          total: Number(total.toFixed(2)),
          patient: normalizedPatient,
          createdBy: buildCreatedByPayload(user)
        }
      ],
      { session }
    );

    await session.commitTransaction();
    return { check };
  } catch (error) {
    await safeAbortTransaction(session);
    throw error;
  } finally {
    session.endSession();
  }
};

const createLorCheckout = async ({ services = [], patient, lorIdentity, user }) => {
  if (!user || user.role !== "lor") {
    throw new AppError("Bu chekni faqat lor yaratishi mumkin", 403);
  }

  const serviceItems = Array.isArray(services) ? services : [];
  if (serviceItems.length === 0) {
    throw new AppError("Kamida bitta xizmat tanlanishi kerak", 400);
  }

  assertUniqueIds(
    serviceItems,
    "serviceId",
    "Duplicate service is not allowed in one checkout"
  );

  const normalizedServiceItems = serviceItems.map((item) => ({
    serviceId: item.serviceId,
    quantity: Number(item.quantity),
    priceTier: item.priceTier
  }));

  normalizedServiceItems.forEach((item) => assertObjectId(item.serviceId, "Xizmat ID"));
  const normalizedPatient = normalizePatient(patient);
  const normalizedLorIdentity = normalizeLorIdentity(lorIdentity);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    let total = 0;
    const checkItems = [];
    const serviceUsageDocs = [];
    const serviceIds = normalizedServiceItems.map((item) => item.serviceId);
    const serviceDocs = await Service.find({
      _id: { $in: serviceIds }
    }).session(session);
    const serviceMap = new Map(serviceDocs.map((service) => [service._id.toString(), service]));

    for (const item of normalizedServiceItems) {
      const quantity = item.quantity;
      validateQuantity(quantity);

      const service = serviceMap.get(String(item.serviceId));
      if (!service) {
        throw new AppError("Xizmat topilmadi", 404);
      }

      enforceServiceRoleRule(service, user.role);
      enforceLorServiceOwnership(service, user);

      const resolved = resolveServicePrice({
        service,
        priceTier: item.priceTier,
        userRole: user.role
      });

      serviceUsageDocs.push({
        serviceId: service._id,
        quantity,
        usedBy: user._id,
        ...(resolved.priceTier ? { priceTier: resolved.priceTier } : {})
      });

      checkItems.push({
        itemType: "service",
        name: getServiceCheckItemName(service.name, resolved.tierLabel),
        quantity,
        price: resolved.price
      });

      total += quantity * resolved.price;
    }

    await ServiceUsage.insertMany(serviceUsageDocs, { session });

    const checkId = await createUniqueCheckId(session);
    const [check] = await Check.create(
      [
        {
          checkId,
          type: "service",
          items: checkItems,
          total: Number(total.toFixed(2)),
          patient: normalizedPatient,
          createdBy: buildCreatedByPayload(user, {
            lorIdentity: normalizedLorIdentity
          })
        }
      ],
      { session }
    );

    await session.commitTransaction();
    return { check };
  } catch (error) {
    await safeAbortTransaction(session);
    throw error;
  } finally {
    session.endSession();
  }
};

module.exports = {
  useMedicine,
  useService,
  createNurseCheckout,
  createLorCheckout,
  getMyChecks
};
