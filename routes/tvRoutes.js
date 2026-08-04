const express = require("express");
const tvController = require("../controllers/tvController");
const { protect } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

const router = express.Router();

router.use(protect, allowRoles("tv", "cashier", "manager"));

router.get("/lor-queue", tvController.getLorQueue);

module.exports = router;
