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

const validateQuantity = (quantity) => {
  if (typeof quantity !== "number" || quantity <= 0) {
    throw new AppError("Quantity must be greater than 0", 400);
  }
};

const validatePrice = (price) => {
  if (typeof price !== "number" || price <= 0 || price >= 1000000) {
    throw new AppError("Price must be > 0 and < 1,000,000", 400);
  }
};

const resolvePrice = (inputPrice, basePrice, label = "Item") => {
  if (inputPrice === undefined || inputPrice === null || inputPrice === "") {
    const fallback = Number(basePrice);
    if (!Number.isFinite(fallback) || fallback <= 0 || fallback >= 1000000) {
      throw new AppError(`${label} uchun saqlangan narx noto'g'ri`, 400);
    }

    return fallback;
  }

  const price = Number(inputPrice);
  validatePrice(price);
  return price;
};

const normalizePriceTier = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const normalized = String(value).trim().toLowerCase();
  if (!NURSE_PRICE_TIERS.includes(normalized)) {
    throw new AppError("priceTier must be first, second or third", 400);
  }

  return normalized;
};

const resolveServicePrice = ({ service, inputPrice, priceTier, userRole }) => {
  if (inputPrice !== undefined && inputPrice !== null && inputPrice !== "") {
    const price = Number(inputPrice);
    validatePrice(price);
    return { price, priceTier: null, tierLabel: null };
  }

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
    price: resolvePrice(undefined, service?.price, service?.name),
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
    throw new AppError("Patient firstName and lastName are required", 400);
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
    throw new AppError("Patient firstName and lastName are required", 400);
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
    throw new AppError("lorIdentity is required for LOR", 400);
  }

  if (!["lor1", "lor2"].includes(normalized)) {
    throw new AppError("lorIdentity must be lor1 or lor2", 400);
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

  throw new AppError("Could not generate unique check ID", 500);
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
      throw new AppError(`Missing ${key} in request item`, 400);
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
    throw new AppError("Nurse can only use nurse services", 403);
  }

  if (userRole === "lor" && service.type !== "lor") {
    throw new AppError("LOR can only use lor services", 403);
  }
};

const enforceLorServiceOwnership = (service, user) => {
  if (user.role !== "lor") return;

  const ownerId = service?.createdBy?.userId?.toString?.();
  const currentUserId = user?._id?.toString?.();

  // Legacy services (without createdBy) are allowed for LOR.
  if (!ownerId) return;

  if (ownerId !== currentUserId) {
    throw new AppError("LOR can only use services created by themselves", 403);
  }
};

const useMedicine = async ({ medicineId, quantity, price, user }) => {
  validateQuantity(quantity);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const medicine = await Medicine.findOneAndUpdate(
      { _id: medicineId, stock: { $gte: quantity } },
      { $inc: { stock: -quantity } },
      { new: true, session }
    );

    if (!medicine) {
      throw new AppError("Insufficient stock or medicine not found", 400);
    }

    const resolvedPrice = resolvePrice(price, medicine.price, medicine.name);

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
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

const useService = async ({
  serviceId,
  quantity,
  price,
  priceTier,
  patient,
  lorIdentity,
  user
}) => {
  validateQuantity(quantity);
  const normalizedPatient =
    user?.role === "lor" ? normalizePatient(patient) : normalizeOptionalPatient(patient);
  const normalizedLorIdentity =
    user?.role === "lor" ? normalizeLorIdentity(lorIdentity) : null;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const service = await Service.findById(serviceId).session(session);
    if (!service) {
      throw new AppError("Service not found", 404);
    }

    enforceServiceRoleRule(service, user.role);
    enforceLorServiceOwnership(service, user);

    const resolved = resolveServicePrice({
      service,
      inputPrice: price,
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
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

const getMyChecks = async ({ user, search = "", lorIdentity }) => {
  if (!user) {
    throw new AppError("User is required", 401);
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
    throw new AppError("Only nurse can create this checkout", 403);
  }

  const medicineItems = Array.isArray(medicines) ? medicines : [];
  const serviceItems = Array.isArray(services) ? services : [];

  if (medicineItems.length === 0 && serviceItems.length === 0) {
    throw new AppError("At least one medicine or service must be selected", 400);
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

  const normalizedPatient = normalizePatient(patient);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    let total = 0;
    const checkItems = [];
    const medicineUsageDocs = [];
    const serviceUsageDocs = [];

    for (const item of medicineItems) {
      const quantity = Number(item.quantity);
      validateQuantity(quantity);

      const medicine = await Medicine.findOneAndUpdate(
        { _id: item.medicineId, stock: { $gte: quantity } },
        { $inc: { stock: -quantity } },
        { new: true, session }
      );

      if (!medicine) {
        throw new AppError("Insufficient stock or medicine not found", 400);
      }

      const resolvedPrice = resolvePrice(item.price, medicine.price, medicine.name);

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

    for (const item of serviceItems) {
      const quantity = Number(item.quantity);
      validateQuantity(quantity);

      const service = await Service.findById(item.serviceId).session(session);
      if (!service) {
        throw new AppError("Service not found", 404);
      }

      enforceServiceRoleRule(service, user.role);
      enforceLorServiceOwnership(service, user);

      const resolved = resolveServicePrice({
        service,
        inputPrice: item.price,
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
      await MedicineUsage.create(medicineUsageDocs, { session });
    }

    if (serviceUsageDocs.length > 0) {
      await ServiceUsage.create(serviceUsageDocs, { session });
    }

    const checkId = await createUniqueCheckId(session);

    const [check] = await Check.create(
      [
        {
          checkId,
          type: resolveCheckType(medicineItems.length, serviceItems.length),
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
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

const createLorCheckout = async ({ services = [], patient, lorIdentity, user }) => {
  if (!user || user.role !== "lor") {
    throw new AppError("Only lor can create this checkout", 403);
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

  const normalizedPatient = normalizePatient(patient);
  const normalizedLorIdentity = normalizeLorIdentity(lorIdentity);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    let total = 0;
    const checkItems = [];
    const serviceUsageDocs = [];

    for (const item of serviceItems) {
      const quantity = Number(item.quantity);
      validateQuantity(quantity);

      const service = await Service.findById(item.serviceId).session(session);
      if (!service) {
        throw new AppError("Service not found", 404);
      }

      enforceServiceRoleRule(service, user.role);
      enforceLorServiceOwnership(service, user);

      const resolved = resolveServicePrice({
        service,
        inputPrice: item.price,
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

    await ServiceUsage.create(serviceUsageDocs, { session });

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
    await session.abortTransaction();
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
