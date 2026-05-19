const crypto = require("crypto");
const mongoose = require("mongoose");
const Medicine = require("../models/Medicine");
const Service = require("../models/Service");
const Check = require("../models/Check");
const CashierEntry = require("../models/CashierEntry");
const MedicineUsage = require("../models/MedicineUsage");
const ServiceUsage = require("../models/ServiceUsage");
const CashierSpecialist = require("../models/CashierSpecialist");
const AppError = require("../utils/AppError");
const NURSE_PRICE_TIERS = ["first", "second", "third"];
const ROLE_SPECIALIST_TYPES = ["nurse", "lor"];
const SERVICE_PRICE_TIER_LABELS = {
  first: "1-marta",
  second: "2-marta",
  third: "3-marta"
};
const IDEMPOTENCY_KEY_MAX_LENGTH = 120;

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

const normalizeSpecialistName = (value, label = "Mutaxassis") => {
  const name = String(value || "").trim();
  if (!name) {
    throw new AppError(`${label} nomi majburiy`, 400);
  }
  return name;
};

const normalizeIdempotencyKey = (value) => {
  const safe = String(value || "").trim();
  if (!safe) return null;

  if (safe.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
    throw new AppError(
      `Idempotency key uzunligi ${IDEMPOTENCY_KEY_MAX_LENGTH} belgidan oshmasligi kerak`,
      400
    );
  }

  return safe;
};

const parseSearchDateRange = (value) => {
  const safe = String(value || "").trim();
  if (!safe) return null;

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(safe);
  const dottedMatch = /^(\d{2})[./-](\d{2})[./-](\d{4})$/.exec(safe);
  let year;
  let month;
  let day;

  if (isoMatch) {
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]);
    day = Number(isoMatch[3]);
  } else if (dottedMatch) {
    day = Number(dottedMatch[1]);
    month = Number(dottedMatch[2]);
    year = Number(dottedMatch[3]);
  } else {
    return null;
  }

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  const start = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

  return { start, end };
};

const hasDebtOnlyKeyword = (value) => {
  const safe = String(value || "")
    .trim()
    .toLowerCase();
  return ["qarz", "qarzdor", "debt"].includes(safe);
};

const hasPaidOnlyKeyword = (value) => {
  const safe = String(value || "")
    .trim()
    .toLowerCase();
  return ["tolangan", "to'langan", "paid"].includes(safe);
};

const assertSpecialistRole = (user) => {
  const role = String(user?.role || "").toLowerCase();
  if (!ROLE_SPECIALIST_TYPES.includes(role)) {
    throw new AppError("Bu amal faqat hamshira yoki LOR uchun", 403);
  }
  return role;
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

const findCheckByIdempotency = async ({ userId, idempotencyKey }) => {
  if (!idempotencyKey) return null;

  return Check.findOne({
    "createdBy.userId": userId,
    idempotencyKey
  });
};

const buildCreatedByPayload = (user, options = {}) => {
  const displayName = String(options.displayName || "").trim();
  const payload = {
    userId: user._id,
    role: user.role,
    name: displayName || user.name
  };

  if (options.specialistId) {
    payload.specialistId = options.specialistId;
  }

  if (user.role === "lor" && options.lorIdentity) {
    payload.lorIdentity = options.lorIdentity;
    if (!displayName) {
      payload.name = `${user.name} (${options.lorIdentity.toUpperCase()})`;
    }
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

const resolveRoleSpecialistForCheckout = async ({
  specialistId,
  specialistName,
  user,
  roleLabel
}) => {
  const expectedType = assertSpecialistRole(user);
  const safeSpecialistId = String(specialistId || "").trim();

  if (safeSpecialistId) {
    assertObjectId(safeSpecialistId, `${roleLabel} ID`);
    const specialist = await CashierSpecialist.findById(safeSpecialistId);
    if (!specialist) {
      throw new AppError(`Tanlangan ${roleLabel.toLowerCase()} topilmadi`, 404);
    }
    if (specialist.type !== expectedType) {
      throw new AppError(`Tanlangan ${roleLabel.toLowerCase()} turi mos emas`, 400);
    }
    return {
      specialistId: specialist._id,
      specialistName: specialist.name
    };
  }

  return {
    specialistId: undefined,
    specialistName: normalizeSpecialistName(specialistName, roleLabel)
  };
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

const getMyChecks = async ({
  user,
  search = "",
  lorIdentity,
  specialistId,
  specialistName
}) => {
  if (!user) {
    throw new AppError("Foydalanuvchi majburiy", 401);
  }

  const filter = {
    "createdBy.userId": user._id
  };

  if (user.role === "lor") {
    filter["createdBy.lorIdentity"] = normalizeLorIdentity(lorIdentity);

    const safeSpecialistId = String(specialistId || "").trim();
    const safeSpecialistName = String(specialistName || "").trim();
    const specialistConditions = [];

    if (safeSpecialistId) {
      assertObjectId(safeSpecialistId, "Doktor ID");
      specialistConditions.push({ "createdBy.specialistId": safeSpecialistId });
    }

    if (safeSpecialistName) {
      specialistConditions.push({
        "createdBy.name": {
          $regex: `^${escapeRegex(safeSpecialistName)}$`,
          $options: "i"
        }
      });
    }

    if (specialistConditions.length > 0) {
      filter.$and = [
        ...(filter.$and || []),
        {
          $or: specialistConditions
        }
      ];
    }
  }

  const safeSearch = String(search || "").trim();
  if (safeSearch) {
    const pattern = escapeRegex(safeSearch);
    const dateRange = parseSearchDateRange(safeSearch);
    const searchConditions = [
      { checkId: { $regex: pattern, $options: "i" } },
      { "patient.fullName": { $regex: pattern, $options: "i" } },
      { "patient.firstName": { $regex: pattern, $options: "i" } },
      { "patient.lastName": { $regex: pattern, $options: "i" } }
    ];

    if (dateRange) {
      searchConditions.push({
        createdAt: { $gte: dateRange.start, $lte: dateRange.end }
      });
    }

    filter.$and = [
      ...(filter.$and || []),
      {
        $or: searchConditions
      }
    ];
  }

  const checks = await Check.find(filter).sort({ createdAt: -1 }).lean();
  if (!checks.length) {
    return [];
  }

  const checkIds = checks.map((check) => check._id);
  const cashierEntries = await CashierEntry.find({
    checkRef: { $in: checkIds }
  })
    .select(
      "checkRef checkCode amount paidAmount debtAmount paymentMethod patientPhone note specialistName entryDate createdAt createdBy.name"
    )
    .lean();

  const cashierByCheckId = new Map(
    cashierEntries
      .filter((row) => row?.checkRef)
      .map((row) => [String(row.checkRef), row])
  );

  const rows = checks.map((check) => {
    const cashierEntry = cashierByCheckId.get(String(check._id));
    const row = {
      ...check,
      cashierStatus: cashierEntry
        ? {
            accepted: true,
            checkCode: String(cashierEntry.checkCode || "").trim(),
            amount: Number(cashierEntry.amount || check.total || 0),
            paidAmount: Number(cashierEntry.paidAmount || 0),
            debtAmount: Number(cashierEntry.debtAmount || 0),
            paymentMethod: cashierEntry.paymentMethod || "cash",
            acceptedAt: cashierEntry.entryDate || cashierEntry.createdAt,
            patientPhone: String(cashierEntry.patientPhone || "").trim(),
            note: String(cashierEntry.note || "").trim(),
            specialistName: String(cashierEntry.specialistName || "").trim(),
            acceptedByName: String(cashierEntry?.createdBy?.name || "").trim()
          }
        : {
            accepted: false,
            checkCode: "",
            amount: Number(check.total || 0),
            paidAmount: 0,
            debtAmount: Number(check.total || 0),
            paymentMethod: null,
            acceptedAt: null,
            patientPhone: "",
            note: "",
            specialistName: "",
            acceptedByName: ""
          }
    };

    return row;
  });

  return filterChecksByDebtKeyword(rows, safeSearch);
};

const filterChecksByDebtKeyword = (checks, safeSearch) => {
  if (!safeSearch) return checks;

  if (hasDebtOnlyKeyword(safeSearch)) {
    return checks.filter((item) => Number(item?.cashierStatus?.debtAmount || 0) > 0);
  }

  if (hasPaidOnlyKeyword(safeSearch)) {
    return checks.filter((item) => Number(item?.cashierStatus?.debtAmount || 0) <= 0);
  }

  return checks;
};

const getRoleSpecialists = async ({ user, search = "" }) => {
  const type = assertSpecialistRole(user);
  const safeSearch = String(search || "").trim();
  const filter = { type };

  if (safeSearch) {
    filter.name = { $regex: escapeRegex(safeSearch), $options: "i" };
  }

  return CashierSpecialist.find(filter).sort({ name: 1, createdAt: -1 });
};

const createRoleSpecialist = async ({ name, user }) => {
  const type = assertSpecialistRole(user);
  const safeName = normalizeSpecialistName(name, type === "nurse" ? "Hamshira" : "Doktor");

  try {
    return await CashierSpecialist.create({
      name: safeName,
      type,
      createdBy: {
        userId: user._id,
        role: user.role,
        name: user.name
      }
    });
  } catch (error) {
    if (error?.code === 11000) {
      throw new AppError("Bu nom allaqachon mavjud", 400);
    }
    throw error;
  }
};

const getRoleSpecialistById = async ({ specialistId, user }) => {
  const type = assertSpecialistRole(user);
  assertObjectId(specialistId, "Mutaxassis ID");

  const specialist = await CashierSpecialist.findById(specialistId);
  if (!specialist) {
    throw new AppError("Mutaxassis topilmadi", 404);
  }

  if (specialist.type !== type) {
    throw new AppError("Bu mutaxassisni boshqarishga ruxsat yo'q", 403);
  }

  return specialist;
};

const updateRoleSpecialist = async ({ specialistId, name, user }) => {
  const specialist = await getRoleSpecialistById({ specialistId, user });
  const safeName = normalizeSpecialistName(
    name,
    specialist.type === "nurse" ? "Hamshira" : "Doktor"
  );

  specialist.name = safeName;

  try {
    await specialist.save();
    return specialist;
  } catch (error) {
    if (error?.code === 11000) {
      throw new AppError("Bu nom allaqachon mavjud", 400);
    }
    throw error;
  }
};

const deleteRoleSpecialist = async ({ specialistId, user }) => {
  const specialist = await getRoleSpecialistById({ specialistId, user });
  const specialistName = String(specialist.name || "").trim();
  const usageCount = await Check.countDocuments({
    "createdBy.role": specialist.type,
    $or: [
      { "createdBy.specialistId": specialist._id },
      ...(specialistName ? [{ "createdBy.name": specialistName }] : [])
    ]
  });

  if (usageCount > 0) {
    throw new AppError("Bu mutaxassis chek tarixida ishlatilgan, o'chirib bo'lmaydi", 400);
  }

  const cashierEntryCount = await CashierEntry.countDocuments({
    specialistType: specialist.type,
    $or: [
      { specialistId: specialist._id },
      ...(specialistName ? [{ specialistName }] : [])
    ]
  });

  if (cashierEntryCount > 0) {
    throw new AppError("Bu mutaxassis kassa tarixida ishlatilgan, o'chirib bo'lmaydi", 400);
  }

  await CashierSpecialist.deleteOne({ _id: specialist._id });
  return {
    deleted: true,
    id: specialistId
  };
};

const createNurseCheckout = async ({
  medicines = [],
  services = [],
  patient,
  specialistId,
  specialistName,
  idempotencyKey,
  user
}) => {
  if (!user || user.role !== "nurse") {
    throw new AppError("Bu chekni faqat hamshira yaratishi mumkin", 403);
  }

  const safeIdempotencyKey = normalizeIdempotencyKey(idempotencyKey);
  if (safeIdempotencyKey) {
    const existing = await findCheckByIdempotency({
      userId: user._id,
      idempotencyKey: safeIdempotencyKey
    });
    if (existing) {
      return { check: existing, idempotentReplay: true };
    }
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
  const specialist = await resolveRoleSpecialistForCheckout({
    specialistId,
    specialistName,
    user,
    roleLabel: "Hamshira"
  });
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
          ...(safeIdempotencyKey ? { idempotencyKey: safeIdempotencyKey } : {}),
          type: resolveCheckType(normalizedMedicineItems.length, normalizedServiceItems.length),
          items: checkItems,
          total: Number(total.toFixed(2)),
          patient: normalizedPatient,
          createdBy: buildCreatedByPayload(user, {
            displayName: specialist.specialistName,
            specialistId: specialist.specialistId
          })
        }
      ],
      { session }
    );

    await session.commitTransaction();
    return { check, idempotentReplay: false };
  } catch (error) {
    await safeAbortTransaction(session);

    if (safeIdempotencyKey && error?.code === 11000) {
      const existing = await findCheckByIdempotency({
        userId: user._id,
        idempotencyKey: safeIdempotencyKey
      });
      if (existing) {
        return { check: existing, idempotentReplay: true };
      }
    }

    throw error;
  } finally {
    session.endSession();
  }
};

const createLorCheckout = async ({
  services = [],
  patient,
  lorIdentity,
  specialistId,
  specialistName,
  idempotencyKey,
  user
}) => {
  if (!user || user.role !== "lor") {
    throw new AppError("Bu chekni faqat lor yaratishi mumkin", 403);
  }

  const safeIdempotencyKey = normalizeIdempotencyKey(idempotencyKey);
  if (safeIdempotencyKey) {
    const existing = await findCheckByIdempotency({
      userId: user._id,
      idempotencyKey: safeIdempotencyKey
    });
    if (existing) {
      return { check: existing, idempotentReplay: true };
    }
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
  const specialist = await resolveRoleSpecialistForCheckout({
    specialistId,
    specialistName,
    user,
    roleLabel: "Doktor"
  });
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
          ...(safeIdempotencyKey ? { idempotencyKey: safeIdempotencyKey } : {}),
          type: "service",
          items: checkItems,
          total: Number(total.toFixed(2)),
          patient: normalizedPatient,
          createdBy: buildCreatedByPayload(user, {
            lorIdentity: normalizedLorIdentity,
            displayName: specialist.specialistName,
            specialistId: specialist.specialistId
          })
        }
      ],
      { session }
    );

    await session.commitTransaction();
    return { check, idempotentReplay: false };
  } catch (error) {
    await safeAbortTransaction(session);

    if (safeIdempotencyKey && error?.code === 11000) {
      const existing = await findCheckByIdempotency({
        userId: user._id,
        idempotencyKey: safeIdempotencyKey
      });
      if (existing) {
        return { check: existing, idempotentReplay: true };
      }
    }

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
  getMyChecks,
  getRoleSpecialists,
  createRoleSpecialist,
  updateRoleSpecialist,
  deleteRoleSpecialist
};
