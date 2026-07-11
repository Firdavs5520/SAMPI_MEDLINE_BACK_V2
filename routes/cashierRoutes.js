const express = require("express");
const cashierController = require("../controllers/cashierController");
const { protect } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

const router = express.Router();

router.use(protect, allowRoles("cashier", "manager"));

router.get("/settings", cashierController.getSettings);
router.put("/settings", allowRoles("cashier"), cashierController.updateSettings);
router.get("/entries", cashierController.getEntries);
router.get("/summary", cashierController.getSummary);
router.get("/pending-checks", cashierController.getPendingChecks);
router.get("/specialists", cashierController.getSpecialists);
router.post("/specialists", allowRoles("cashier"), cashierController.createSpecialist);
router.post("/entries", allowRoles("cashier"), cashierController.createEntry);
router.patch("/entries/:id", allowRoles("cashier"), cashierController.updateEntry);
router.post("/entries/:id/payments", allowRoles("cashier"), cashierController.payDebt);
router.delete("/entries/:id", allowRoles("cashier"), cashierController.deleteEntry);

module.exports = router;
