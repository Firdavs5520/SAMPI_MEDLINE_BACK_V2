const express = require("express");
const cashierController = require("../controllers/cashierController");
const { protect } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

const router = express.Router();

router.use(protect, allowRoles("cashier", "manager"));

router.get("/entries", cashierController.getEntries);
router.get("/summary", cashierController.getSummary);
router.get("/specialists", cashierController.getSpecialists);
router.post("/specialists", allowRoles("cashier"), cashierController.createSpecialist);
router.delete("/specialists/:id", allowRoles("cashier"), cashierController.deleteSpecialist);
router.post("/entries", allowRoles("cashier"), cashierController.createEntry);
router.patch("/entries/:id", allowRoles("cashier"), cashierController.updateEntry);
router.delete("/entries/:id", allowRoles("cashier"), cashierController.deleteEntry);

module.exports = router;
