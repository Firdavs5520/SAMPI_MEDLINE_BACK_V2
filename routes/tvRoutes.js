const express = require("express");
const tvController = require("../controllers/tvController");
const { protect } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

const router = express.Router();

router.use(protect);

router.post("/lor-current", allowRoles("lor"), tvController.setLorCurrentPatient);
router.get("/lor-queue", allowRoles("tv", "cashier", "manager", "lor"), tvController.getLorQueue);

module.exports = router;
