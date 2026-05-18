const express = require("express");
const reportController = require("../controllers/reportController");
const { protect } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

const router = express.Router();

router.use(protect, allowRoles("manager"));

router.get("/checks", reportController.getAllChecks);
router.get("/revenue", reportController.getRevenue);
router.get("/overview", reportController.getOverview);
router.get("/shift-close", reportController.getShiftCloseReport);
router.get("/monitoring", reportController.getMonitoring);
router.get("/medicine-usage", reportController.getMedicineUsageHistory);
router.get("/current-stock", reportController.getCurrentStock);
router.get("/most-used-medicines", reportController.getMostUsedMedicines);
router.post("/maintenance/reset-today", reportController.resetTodayOperationalData);
router.post("/maintenance/reset-operational", reportController.resetAllOperationalData);

module.exports = router;
