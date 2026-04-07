const asyncHandler = require("../utils/asyncHandler");
const cashierService = require("../services/cashierService");

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

const createEntry = asyncHandler(async (req, res) => {
  const entry = await cashierService.createEntry({
    payload: req.body,
    user: req.user
  });

  res.status(201).json({ success: true, data: entry });
});

const updateEntry = asyncHandler(async (req, res) => {
  const entry = await cashierService.updateEntry({
    entryId: req.params.id,
    payload: req.body,
    user: req.user
  });

  res.status(200).json({ success: true, data: entry });
});

const deleteEntry = asyncHandler(async (req, res) => {
  const result = await cashierService.deleteEntry({
    entryId: req.params.id,
    user: req.user
  });

  res.status(200).json({ success: true, data: result });
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

const deleteSpecialist = asyncHandler(async (req, res) => {
  const data = await cashierService.deleteSpecialist({
    specialistId: req.params.id,
    user: req.user
  });

  res.status(200).json({ success: true, data });
});

module.exports = {
  getEntries,
  getSummary,
  getSpecialists,
  createSpecialist,
  deleteSpecialist,
  createEntry,
  updateEntry,
  deleteEntry
};
