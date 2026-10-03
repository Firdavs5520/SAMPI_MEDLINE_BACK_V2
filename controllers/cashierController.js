const asyncHandler = require("../utils/asyncHandler");
const cashierService = require("../services/cashierService");
const cashierExpenseService = require("../services/cashierExpenseService");

const getExpenses = asyncHandler(async (req, res) => {
  const data = await cashierExpenseService.getExpenses({
    user: req.user,
    date: req.query.date
  });

  res.status(200).json({ success: true, data });
});

const createExpense = asyncHandler(async (req, res) => {
  const data = await cashierExpenseService.createExpense({
    user: req.user,
    amount: req.body.amount,
    reason: req.body.reason,
    paymentMethod: req.body.paymentMethod
  });

  res.status(201).json({ success: true, data });
});

const cancelExpense = asyncHandler(async (req, res) => {
  const data = await cashierExpenseService.cancelExpense({
    user: req.user,
    expenseId: req.params.id
  });

  res.status(200).json({ success: true, data });
});

const getSettings = asyncHandler(async (req, res) => {
  const data = await cashierService.getSettings({
    user: req.user
  });

  res.status(200).json({ success: true, data });
});

const updateSettings = asyncHandler(async (req, res) => {
  const data = await cashierService.updateSettings({
    payload: req.body,
    user: req.user
  });

  res.status(200).json({ success: true, data });
});

const issueLorQueueTicket = asyncHandler(async (req, res) => {
  const data = await cashierService.issueLorQueueTicket({
    payload: req.body,
    user: req.user
  });

  res.status(201).json({ success: true, data });
});

const getLorQueueTicketStatus = asyncHandler(async (req, res) => {
  const data = await cashierService.getLorQueueTicketStatus({
    user: req.user,
    lorIdentity: req.query.lorIdentity || "lor1"
  });

  res.status(200).json({ success: true, data });
});

const getEntries = asyncHandler(async (req, res) => {
  const data = await cashierService.getEntries({
    user: req.user,
    date: req.query.date,
    department: req.query.department,
    specialistType: req.query.specialistType,
    paymentMethod: req.query.paymentMethod,
    debtOnly: req.query.debtOnly,
    search: req.query.search,
    timeScope: req.query.timeScope
  });

  res.status(200).json({ success: true, data });
});

const getSummary = asyncHandler(async (req, res) => {
  const data = await cashierService.getSummary({
    user: req.user,
    date: req.query.date,
    department: req.query.department,
    specialistType: req.query.specialistType,
    paymentMethod: req.query.paymentMethod,
    debtOnly: req.query.debtOnly,
    search: req.query.search,
    timeScope: req.query.timeScope
  });

  res.status(200).json({ success: true, data });
});

const getPendingChecks = asyncHandler(async (req, res) => {
  const data = await cashierService.getPendingChecks({
    user: req.user,
    role: req.query.role,
    search: req.query.search,
    limit: req.query.limit
  });

  res.status(200).json({ success: true, data });
});

const createEntry = asyncHandler(async (req, res) => {
  const entry = await cashierService.createEntry({
    payload: req.body,
    user: req.user
  });

  res.status(201).json({ success: true, data: entry });
});

const payDebt = asyncHandler(async (req, res) => {
  const entry = await cashierService.payDebt({
    entryId: req.params.id,
    payload: req.body,
    user: req.user
  });

  res.status(200).json({ success: true, data: entry });
});

const getSpecialists = asyncHandler(async (req, res) => {
  const data = await cashierService.getSpecialists({
    user: req.user,
    type: req.query.type,
    search: req.query.search
  });

  res.status(200).json({ success: true, data });
});

const createSpecialist = asyncHandler(async (req, res) => {
  const data = await cashierService.createSpecialist({
    payload: req.body,
    user: req.user
  });

  res.status(201).json({ success: true, data });
});

module.exports = {
  getExpenses,
  createExpense,
  cancelExpense,
  getSettings,
  updateSettings,
  issueLorQueueTicket,
  getLorQueueTicketStatus,
  getEntries,
  getSummary,
  getPendingChecks,
  getSpecialists,
  createSpecialist,
  createEntry,
  payDebt
};
