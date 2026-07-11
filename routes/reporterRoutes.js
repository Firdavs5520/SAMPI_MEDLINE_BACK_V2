const express = require("express");
const reporterController = require("../controllers/reporterController");
const { protect } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

const router = express.Router();

router.use(protect, allowRoles("reporter", "manager"));

router.get("/daily", reporterController.getDailyReport);
router.put("/daily", reporterController.updateDailyRecord);
router.get("/monthly", reporterController.getMonthlyReport);
router.get("/monthly/export", reporterController.exportMonthlyReport);

module.exports = router;
