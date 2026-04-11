const Medicine = require("../models/Medicine");
const MedicineUsage = require("../models/MedicineUsage");
const AppError = require("../utils/AppError");
const mongoose = require("mongoose");

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const safeAbortTransaction = async (session) => {
  if (!session) return;

  try {
    if (typeof session.inTransaction === "function" && session.inTransaction()) {
      await session.abortTransaction();
    }
  } catch (_) {
    // Preserve original error in catch block.
  }
};

const findMedicineByNameInsensitive = (name) =>
  Medicine.findOne({
    name: {
      $regex: `^${escapeRegex(name)}$`,
      $options: "i"
    }
  });

const getAllMedicines = async ({ includeArchived = false } = {}) => {
  const filter = includeArchived ? {} : { isArchived: { $ne: true } };
  return Medicine.find(filter).sort({ createdAt: -1 });
};

const getMedicineById = async (medicineId) => {
  const medicine = await Medicine.findById(medicineId);
  if (!medicine) {
    throw new AppError("Dori topilmadi", 404);
  }
  return medicine;
};

const addMedicine = async ({ name, price, user }) => {
  if (!name || typeof name !== "string") {
    throw new AppError("Dori nomi majburiy", 400);
  }

  if (typeof price !== "number" || price <= 0 || price >= 1000000) {
    throw new AppError("Narx 0 dan katta va 1,000,000 dan kichik bo'lishi kerak", 400);
  }

  if (!user || user.role !== "nurse") {
    throw new AppError("Yangi dori nomini faqat hamshira qo'sha oladi", 403);
  }

  const safeName = name.trim();
  if (!safeName) {
    throw new AppError("Dori nomi majburiy", 400);
  }

  const existingMedicine = await findMedicineByNameInsensitive(safeName);

  if (existingMedicine && existingMedicine.isArchived) {
    existingMedicine.isArchived = false;
    existingMedicine.price = price;
    existingMedicine.stock = 0;
    existingMedicine.createdBy = {
      userId: user._id,
      role: user.role,
      name: user.name
    };
    await existingMedicine.save();
    return existingMedicine;
  }

  if (existingMedicine) {
    throw new AppError("Bunday dori nomi allaqachon mavjud", 400);
  }

  return Medicine.create({
    name: safeName,
    stock: 0,
    price,
    isArchived: false,
    createdBy: {
      userId: user._id,
      role: user.role,
      name: user.name
    }
  });
};

const updateMedicine = async ({ medicineId, name, price, user }) => {
  if (!user || user.role !== "nurse") {
    throw new AppError("Dorilarni faqat hamshira tahrirlay oladi", 403);
  }

  const medicine = await Medicine.findById(medicineId);
  if (!medicine) {
    throw new AppError("Dori topilmadi", 404);
  }
  if (medicine.isArchived) {
    throw new AppError("Bu dori arxivlangan, tahrirlab bo'lmaydi", 400);
  }

  const hasName = typeof name === "string";
  const hasPrice = price !== undefined && price !== null && price !== "";

  if (!hasName && !hasPrice) {
    throw new AppError("Kamida bitta maydon (nomi yoki narxi) kiritilishi kerak", 400);
  }

  if (hasName) {
    const safeName = name.trim();
    if (!safeName) {
      throw new AppError("Dori nomi majburiy", 400);
    }

    const sameNameMedicine = await findMedicineByNameInsensitive(safeName);
    if (sameNameMedicine && String(sameNameMedicine._id) !== String(medicine._id)) {
      throw new AppError("Bunday dori nomi allaqachon mavjud", 400);
    }

    medicine.name = safeName;
  }

  if (hasPrice) {
    if (typeof price !== "number" || price <= 0 || price >= 1000000) {
      throw new AppError("Narx 0 dan katta va 1,000,000 dan kichik bo'lishi kerak", 400);
    }
    medicine.price = price;
  }

  await medicine.save();
  return medicine;
};

const deleteMedicine = async ({ medicineId, user }) => {
  if (!user || user.role !== "nurse") {
    throw new AppError("Dorilarni faqat hamshira o'chira oladi", 403);
  }

  const medicine = await Medicine.findById(medicineId);
  if (!medicine) {
    throw new AppError("Dori topilmadi", 404);
  }
  if (medicine.isArchived) {
    return { archived: true, medicineId: String(medicine._id) };
  }

  if (medicine.stock > 0) {
    throw new AppError("Stock 0 bo'lmaguncha dorini o'chirib bo'lmaydi", 400);
  }

  const usageCount = await MedicineUsage.countDocuments({ medicineId: medicine._id });
  if (usageCount > 0) {
    medicine.isArchived = true;
    await medicine.save();
    return {
      archived: true,
      medicineId: String(medicine._id)
    };
  }

  await Medicine.deleteOne({ _id: medicine._id });
  return { deleted: true, medicineId: String(medicine._id) };
};

const increaseStock = async ({ medicineId, quantity }) => {
  if (typeof quantity !== "number" || quantity <= 0) {
    throw new AppError("Miqdor 0 dan katta bo'lishi kerak", 400);
  }

  const medicine = await Medicine.findOneAndUpdate(
    { _id: medicineId, isArchived: { $ne: true } },
    { $inc: { stock: quantity } },
    { new: true, runValidators: true }
  );

  if (!medicine) {
    throw new AppError("Dori topilmadi", 404);
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
      throw new AppError("Dori identifikatori majburiy", 400);
    }
    if (!isValidObjectId(item.medicineId.trim())) {
      throw new AppError("Dori identifikatori noto'g'ri", 400);
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
      _id: { $in: medicineIds },
      isArchived: { $ne: true }
    })
      .select("_id name")
      .session(session);

    if (medicines.length !== medicineIds.length) {
      const foundSet = new Set(medicines.map((item) => String(item._id)));
      const missingIds = medicineIds.filter((id) => !foundSet.has(String(id)));
      throw new AppError(`Dori topilmadi: ${missingIds.join(", ")}`, 404);
    }

    const operations = groupedItems.map((item) => ({
      updateOne: {
        filter: { _id: item.medicineId },
        update: { $inc: { stock: item.quantity } }
      }
    }));

    const operationsWithArchiveGuard = operations.map((op) => ({
      updateOne: {
        ...op.updateOne,
        filter: {
          ...op.updateOne.filter,
          isArchived: { $ne: true }
        }
      }
    }));

    await Medicine.bulkWrite(operationsWithArchiveGuard, { session });

    const updatedMedicines = await Medicine.find({
      _id: { $in: medicineIds },
      isArchived: { $ne: true }
    })
      .sort({ name: 1 })
      .session(session);

    await session.commitTransaction();
    return updatedMedicines;
  } catch (error) {
    await safeAbortTransaction(session);
    throw error;
  } finally {
    session.endSession();
  }
};

const updateStock = async ({ medicineId, stock }) => {
  if (typeof stock !== "number" || stock < 0) {
    throw new AppError("Qoldiq son bo'lishi va manfiy bo'lmasligi kerak", 400);
  }

  const medicine = await Medicine.findOneAndUpdate(
    { _id: medicineId, isArchived: { $ne: true } },
    { $set: { stock } },
    { new: true, runValidators: true }
  );

  if (!medicine) {
    throw new AppError("Dori topilmadi", 404);
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
