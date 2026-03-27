const express = require("express");
const medicineController = require("../controllers/medicineController");
const { protect } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

const router = express.Router();

router.use(protect);

router.get("/", medicineController.getAllMedicines);
router.get("/:id", medicineController.getMedicineById);
router.post("/", allowRoles("nurse"), medicineController.addMedicine);
router.patch("/:id", allowRoles("nurse"), medicineController.updateMedicine);
router.delete("/:id", allowRoles("nurse"), medicineController.deleteMedicine);
router.patch(
  "/:id/increase",
  allowRoles("delivery"),
  medicineController.increaseStock
);
router.patch("/:id/stock", allowRoles("delivery"), medicineController.updateStock);

module.exports = router;
