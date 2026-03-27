const express = require("express");
const reportController = require("../controllers/reportController");
const { protect } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

const router = express.Router();

router.use(protect, allowRoles("manager"));

router.get("/checks", reportController.getAllChecks);
router.get("/revenue", reportController.getRevenue);
router.get("/overview", reportController.getOverview);
router.get("/medicine-usage", reportController.getMedicineUsageHistory);
router.get("/current-stock", reportController.getCurrentStock);
router.get("/most-used-medicines", reportController.getMostUsedMedicines);

module.exports = router;
