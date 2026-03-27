const Medicine = require("../models/Medicine");
const MedicineUsage = require("../models/MedicineUsage");
const AppError = require("../utils/AppError");
const mongoose = require("mongoose");

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

const updateMedicine = async ({ medicineId, name, price, user }) => {
  if (!user || user.role !== "nurse") {
    throw new AppError("Only nurse can update medicine", 403);
  }

  const medicine = await Medicine.findById(medicineId);
  if (!medicine) {
    throw new AppError("Medicine not found", 404);
  }

  if (!medicine.createdBy?.userId || String(medicine.createdBy.userId) !== String(user._id)) {
    throw new AppError("You can only update your own medicines", 403);
  }

  const hasName = typeof name === "string";
  const hasPrice = price !== undefined && price !== null && price !== "";

  if (!hasName && !hasPrice) {
    throw new AppError("At least one field (name or price) is required", 400);
  }

  if (hasName) {
    const safeName = name.trim();
    if (!safeName) {
      throw new AppError("Medicine name is required", 400);
    }
    medicine.name = safeName;
  }

  if (hasPrice) {
    if (typeof price !== "number" || price <= 0 || price >= 1000000) {
      throw new AppError("Price must be > 0 and < 1,000,000", 400);
    }
    medicine.price = price;
  }

  await medicine.save();
  return medicine;
};

const deleteMedicine = async ({ medicineId, user }) => {
  if (!user || user.role !== "nurse") {
    throw new AppError("Only nurse can delete medicine", 403);
  }

  const medicine = await Medicine.findById(medicineId);
  if (!medicine) {
    throw new AppError("Medicine not found", 404);
  }

  if (!medicine.createdBy?.userId || String(medicine.createdBy.userId) !== String(user._id)) {
    throw new AppError("You can only delete your own medicines", 403);
  }

  if (medicine.stock > 0) {
    throw new AppError("Stock 0 bo'lmaguncha dorini o'chirib bo'lmaydi", 400);
  }

  const usageCount = await MedicineUsage.countDocuments({ medicineId: medicine._id });
  if (usageCount > 0) {
    throw new AppError("Bu dori ishlatilgan, tarix uchun o'chirib bo'lmaydi", 400);
  }

  await Medicine.deleteOne({ _id: medicine._id });
  return { deleted: true, medicineId: String(medicine._id) };
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

const increaseStockBulk = async ({ items }) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError("Kamida bitta dori yuborilishi kerak", 400);
  }

  if (items.length > 100) {
    throw new AppError("Bir martada maksimum 100 ta dori yuborish mumkin", 400);
  }

  const normalizedItems = items.map((item) => {
    const quantity = Number(item?.quantity);
    if (typeof item?.medicineId !== "string" || !item.medicineId.trim()) {
      throw new AppError("medicineId majburiy", 400);
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new AppError("Har bir miqdor 0 dan katta bo'lishi kerak", 400);
    }

    return {
      medicineId: item.medicineId.trim(),
      quantity
    };
  });

  const groupedMap = new Map();
  normalizedItems.forEach((item) => {
    groupedMap.set(
      item.medicineId,
      (groupedMap.get(item.medicineId) || 0) + item.quantity
    );
  });

  const groupedItems = Array.from(groupedMap.entries()).map(([medicineId, quantity]) => ({
    medicineId,
    quantity
  }));
  const medicineIds = groupedItems.map((item) => item.medicineId);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const medicines = await Medicine.find({
      _id: { $in: medicineIds }
    })
      .select("_id name")
      .session(session);

    if (medicines.length !== medicineIds.length) {
      const foundSet = new Set(medicines.map((item) => String(item._id)));
      const missingIds = medicineIds.filter((id) => !foundSet.has(String(id)));
      throw new AppError(`Medicine not found: ${missingIds.join(", ")}`, 404);
    }

    const operations = groupedItems.map((item) => ({
      updateOne: {
        filter: { _id: item.medicineId },
        update: { $inc: { stock: item.quantity } }
      }
    }));

    await Medicine.bulkWrite(operations, { session });

    const updatedMedicines = await Medicine.find({
      _id: { $in: medicineIds }
    })
      .sort({ name: 1 })
      .session(session);

    await session.commitTransaction();
    return updatedMedicines;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
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
  updateMedicine,
  deleteMedicine,
  increaseStock,
  increaseStockBulk,
  updateStock
};
