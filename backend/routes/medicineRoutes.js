const express = require("express");
const medicineController = require("../controllers/medicineController");
const { protect } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

const router = express.Router();

router.use(protect);

router.get("/", medicineController.getAllMedicines);
router.get("/:id", medicineController.getMedicineById);
router.post("/", allowRoles("nurse"), medicineController.addMedicine);
router.patch(
  "/:id/increase",
  allowRoles("delivery"),
  medicineController.increaseStock
);

module.exports = router;
