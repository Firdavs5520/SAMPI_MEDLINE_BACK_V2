const asyncHandler = require("../utils/asyncHandler");
const medicineService = require("../services/medicineService");

const toNumber = (value) => (typeof value === "string" ? Number(value) : value);

const getAllMedicines = asyncHandler(async (req, res) => {
  const medicines = await medicineService.getAllMedicines();
  res.status(200).json({ success: true, data: medicines });
});

const getMedicineById = asyncHandler(async (req, res) => {
  const medicine = await medicineService.getMedicineById(req.params.id);
  res.status(200).json({ success: true, data: medicine });
});

const addMedicine = asyncHandler(async (req, res) => {
  const medicine = await medicineService.addMedicine({
    name: req.body.name,
    price: toNumber(req.body.price),
    user: req.user
  });
  res.status(201).json({ success: true, data: medicine });
});

const increaseStock = asyncHandler(async (req, res) => {
  const medicine = await medicineService.increaseStock({
    medicineId: req.params.id,
    quantity: toNumber(req.body.quantity)
  });
  res.status(200).json({ success: true, data: medicine });
});

const updateStock = asyncHandler(async (req, res) => {
  const medicine = await medicineService.updateStock({
    medicineId: req.params.id,
    stock: toNumber(req.body.stock)
  });
  res.status(200).json({ success: true, data: medicine });
});

module.exports = {
  getAllMedicines,
  getMedicineById,
  addMedicine,
  increaseStock,
  updateStock
};
