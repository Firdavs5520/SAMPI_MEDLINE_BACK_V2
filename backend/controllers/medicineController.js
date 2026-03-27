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

const updateMedicine = asyncHandler(async (req, res) => {
  const medicine = await medicineService.updateMedicine({
    medicineId: req.params.id,
    name: req.body.name,
    price: toNumber(req.body.price),
    user: req.user
  });
  res.status(200).json({ success: true, data: medicine });
});

const deleteMedicine = asyncHandler(async (req, res) => {
  const result = await medicineService.deleteMedicine({
    medicineId: req.params.id,
    user: req.user
  });
  res.status(200).json({ success: true, data: result });
});

const increaseStock = asyncHandler(async (req, res) => {
  const medicine = await medicineService.increaseStock({
    medicineId: req.params.id,
    quantity: toNumber(req.body.quantity)
  });
  res.status(200).json({ success: true, data: medicine });
});

const increaseStockBulk = asyncHandler(async (req, res) => {
  const items = Array.isArray(req.body.items)
    ? req.body.items.map((item) => ({
        medicineId: item.medicineId,
        quantity: toNumber(item.quantity)
      }))
    : [];

  const medicines = await medicineService.increaseStockBulk({
    items
  });

  res.status(200).json({ success: true, data: medicines });
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
  updateMedicine,
  deleteMedicine,
  increaseStock,
  increaseStockBulk,
  updateStock
};
