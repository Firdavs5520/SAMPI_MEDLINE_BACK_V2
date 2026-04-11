const express = require("express");
const serviceController = require("../controllers/serviceController");
const { protect } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

const router = express.Router();

router.use(protect);

router.get("/", serviceController.getAllServices);
router.get("/:id", serviceController.getServiceById);
router.post("/", allowRoles("lor", "nurse"), serviceController.createService);
router.patch("/:id", allowRoles("nurse", "lor"), serviceController.updateService);
router.delete("/:id", allowRoles("nurse", "lor"), serviceController.deleteService);

module.exports = router;
