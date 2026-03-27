const Medicine = require("../models/Medicine");
const AppError = require("../utils/AppError");

const getAllMedicines = async () => {
  return Medicine.find().sort({ createdAt: -1 });
};

const getMedicineById = async (medicineId) => {
  const medicine = await Medicine.findById(medicineId);
  if (!medicine) {
    throw new AppError("Medicine not found", 404);
  }
  return medicine;
};

const addMedicine = async ({ name, price, user }) => {
  if (!name || typeof name !== "string") {
    throw new AppError("Medicine name is required", 400);
  }

  if (typeof price !== "number" || price <= 0 || price >= 1000000) {
    throw new AppError("Price must be > 0 and < 1,000,000", 400);
  }

  if (!user || user.role !== "nurse") {
    throw new AppError("Only nurse can add new medicine names", 403);
  }

  return Medicine.create({
    name: name.trim(),
    stock: 0,
    price,
    createdBy: {
      userId: user._id,
      role: user.role,
      name: user.name
    }
  });
};

const increaseStock = async ({ medicineId, quantity }) => {
  if (typeof quantity !== "number" || quantity <= 0) {
    throw new AppError("Quantity must be greater than 0", 400);
  }

  const medicine = await Medicine.findOneAndUpdate(
    { _id: medicineId },
    { $inc: { stock: quantity } },
    { new: true, runValidators: true }
  );

  if (!medicine) {
    throw new AppError("Medicine not found", 404);
  }

  return medicine;
};

const updateStock = async ({ medicineId, stock }) => {
  if (typeof stock !== "number" || stock < 0) {
    throw new AppError("Stock must be a number and cannot be negative", 400);
  }

  const medicine = await Medicine.findOneAndUpdate(
    { _id: medicineId },
    { $set: { stock } },
    { new: true, runValidators: true }
  );

  if (!medicine) {
    throw new AppError("Medicine not found", 404);
  }

  return medicine;
};

module.exports = {
  getAllMedicines,
  getMedicineById,
  addMedicine,
  increaseStock,
  updateStock
};
