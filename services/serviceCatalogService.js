const Service = require("../models/Service");
const AppError = require("../utils/AppError");

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

const createService = async ({ name, type, price, user }) => {
  if (!name || typeof name !== "string") {
    throw new AppError("Service name is required", 400);
  }
  if (!["nurse", "lor"].includes(type)) {
    throw new AppError('Service type must be "nurse" or "lor"', 400);
  }
  if (typeof price !== "number" || price <= 0 || price >= 1000000) {
    throw new AppError("Price must be > 0 and < 1,000,000", 400);
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

  return Service.create({
    name: name.trim(),
    type,
    createdBy: {
      userId: user._id,
      role: user.role,
      name: user.name
    },
    price
  });
};

module.exports = { getAllServices, getServiceById, createService };
