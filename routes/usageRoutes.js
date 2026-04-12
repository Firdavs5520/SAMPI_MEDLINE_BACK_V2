const express = require("express");
const usageController = require("../controllers/usageController");
const { protect } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

const router = express.Router();

router.use(protect);

router.post("/medicine", allowRoles("nurse"), usageController.useMedicine);
router.post("/service", allowRoles("nurse", "lor"), usageController.useService);
router.post("/checkout", allowRoles("nurse"), usageController.createCheckout);
router.post("/lor-checkout", allowRoles("lor"), usageController.createLorCheckout);
router.get("/my-checks", allowRoles("lor"), usageController.getMyChecks);
router.get(
  "/specialists",
  allowRoles("nurse", "lor"),
  usageController.getRoleSpecialists
);
router.post(
  "/specialists",
  allowRoles("nurse", "lor"),
  usageController.createRoleSpecialist
);

module.exports = router;
    
