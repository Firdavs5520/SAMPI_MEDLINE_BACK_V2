const express = require("express");
const cashierController = require("../controllers/cashierController");
const { protect } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

const router = express.Router();

router.use(protect, allowRoles("cashier", "manager"));

router.get("/settings", cashierController.getSettings);
router.put("/settings", allowRoles("cashier"), cashierController.updateSettings);
router.get(
  "/lor-queue-tickets/status",
  allowRoles("cashier"),
  cashierController.getLorQueueTicketStatus
);
router.post("/lor-queue-tickets", allowRoles("cashier"), cashierController.issueLorQueueTicket);
router.get("/expenses", cashierController.getExpenses);
router.post("/expenses", allowRoles("cashier"), cashierController.createExpense);
router.post("/expenses/:id/cancel", allowRoles("cashier"), cashierController.cancelExpense);
router.get("/entries", cashierController.getEntries);
router.get("/summary", cashierController.getSummary);
router.get("/pending-checks", cashierController.getPendingChecks);
router.get("/specialists", cashierController.getSpecialists);
router.post("/specialists", allowRoles("cashier"), cashierController.createSpecialist);
router.post("/entries", allowRoles("cashier"), cashierController.createEntry);
router.post("/entries/:id/payments", allowRoles("cashier"), cashierController.payDebt);

module.exports = router;
