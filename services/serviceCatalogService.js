const Service = require("../models/Service");
const ServiceUsage = require("../models/ServiceUsage");
const AppError = require("../utils/AppError");

const validatePrice = (price) => {
  if (typeof price !== "number" || price <= 0 || price >= 1000000) {
    throw new AppError("Price must be > 0 and < 1,000,000", 400);
  }
};

const parseNursePriceOptions = (priceOptions) => {
  const first = Number(priceOptions?.first);
  const second = Number(priceOptions?.second);
  const third = Number(priceOptions?.third);

  validatePrice(first);
  validatePrice(second);
  validatePrice(third);

  return { first, second, third };
};

const getAllServices = async ({ user } = {}) => {
  if (user?.role === "lor") {
    return Service.find({
      type: "lor",
      $or: [
        { "createdBy.userId": user._id },
        { "createdBy.userId": { $exists: false } }
      ]
    }).sort({ createdAt: -1 });
  }

  return Service.find().sort({ createdAt: -1 });
};

const getServiceById = async (serviceId) => {
  const service = await Service.findById(serviceId);
  if (!service) {
    throw new AppError("Service not found", 404);
  }
  return service;
};

const createService = async ({ name, type, price, priceOptions, user }) => {
  if (!name || typeof name !== "string") {
    throw new AppError("Service name is required", 400);
  }
  if (!["nurse", "lor"].includes(type)) {
    throw new AppError('Service type must be "nurse" or "lor"', 400);
  }
  if (!user) {
    throw new AppError("User is required", 401);
  }
  if (user.role === "lor" && type !== "lor") {
    throw new AppError("LOR can only add lor services", 403);
  }
  if (user.role === "nurse" && type !== "nurse") {
    throw new AppError("Nurse can only add nurse services", 403);
  }
  if (!["manager", "lor", "nurse"].includes(user.role)) {
    throw new AppError("Only manager, lor or nurse can add services", 403);
  }

  let normalizedPrice = Number(price);
  let normalizedPriceOptions;

  if (type === "nurse") {
    normalizedPriceOptions = parseNursePriceOptions(priceOptions);
    normalizedPrice = normalizedPriceOptions.first;
  } else {
    validatePrice(normalizedPrice);
  }

  return Service.create({
    name: name.trim(),
    type,
    createdBy: {
      userId: user._id,
      role: user.role,
      name: user.name
    },
    ...(normalizedPriceOptions ? { priceOptions: normalizedPriceOptions } : {}),
    price: normalizedPrice
  });
};

const assertServiceOwnership = (service, user) => {
  if (!service.createdBy?.userId) {
    throw new AppError("Legacy xizmatni tahrirlash/o'chirish mumkin emas", 403);
  }

  if (String(service.createdBy.userId) !== String(user._id)) {
    throw new AppError("Siz faqat o'zingiz qo'shgan xizmatni boshqarishingiz mumkin", 403);
  }
};

const updateService = async ({ serviceId, name, price, priceOptions, user }) => {
  if (!user || !["nurse", "lor"].includes(user.role)) {
    throw new AppError("Only nurse or lor can update service", 403);
  }

  const service = await Service.findById(serviceId);
  if (!service) {
    throw new AppError("Service not found", 404);
  }

  if (user.role === "nurse" && service.type !== "nurse") {
    throw new AppError("Nurse can only update nurse services", 403);
  }
  if (user.role === "lor" && service.type !== "lor") {
    throw new AppError("LOR can only update lor services", 403);
  }

  if (user.role === "lor") {
    assertServiceOwnership(service, user);
  }

  const hasName = typeof name === "string";
  const hasPrice = price !== undefined && price !== null && price !== "";
  const hasPriceOptions =
    priceOptions &&
    typeof priceOptions === "object" &&
    (priceOptions.first !== undefined ||
      priceOptions.second !== undefined ||
      priceOptions.third !== undefined);

  if (!hasName && !hasPrice && !hasPriceOptions) {
    throw new AppError("At least one field is required", 400);
  }

  if (hasName) {
    const safeName = name.trim();
    if (!safeName) {
      throw new AppError("Service name is required", 400);
    }
    service.name = safeName;
  }

  if (service.type === "nurse") {
    if (hasPriceOptions) {
      const normalizedPriceOptions = parseNursePriceOptions(priceOptions);
      service.priceOptions = normalizedPriceOptions;
      service.price = normalizedPriceOptions.first;
    } else if (hasPrice) {
      const normalized = Number(price);
      validatePrice(normalized);

      const currentOptions = service.priceOptions || {};
      const second = Number(currentOptions.second);
      const third = Number(currentOptions.third);
      if (!Number.isFinite(second) || !Number.isFinite(third) || second <= 0 || third <= 0) {
        throw new AppError(
          "Nurse service narxini yangilash uchun 1/2/3-marta narxlarni yuboring",
          400
        );
      }

      service.priceOptions = {
        first: normalized,
        second,
        third
      };
      service.price = normalized;
    }
  } else if (hasPrice) {
    const normalized = Number(price);
    validatePrice(normalized);
    service.price = normalized;
  }

  await service.save();
  return service;
};

const deleteService = async ({ serviceId, user }) => {
  if (!user || !["nurse", "lor"].includes(user.role)) {
    throw new AppError("Only nurse or lor can delete service", 403);
  }

  const service = await Service.findById(serviceId);
  if (!service) {
    throw new AppError("Service not found", 404);
  }

  if (user.role === "nurse" && service.type !== "nurse") {
    throw new AppError("Nurse can only delete nurse services", 403);
  }
  if (user.role === "lor" && service.type !== "lor") {
    throw new AppError("LOR can only delete lor services", 403);
  }

  if (user.role === "lor") {
    assertServiceOwnership(service, user);
  }

  const usageCount = await ServiceUsage.countDocuments({ serviceId: service._id });
  if (usageCount > 0) {
    throw new AppError("Bu xizmat ishlatilgan, tarix uchun o'chirib bo'lmaydi", 400);
  }

  await Service.deleteOne({ _id: service._id });
  return { deleted: true, serviceId: String(service._id) };
};

module.exports = {
  getAllServices,
  getServiceById,
  createService,
  updateService,
  deleteService
};
