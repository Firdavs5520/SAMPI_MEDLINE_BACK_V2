const asyncHandler = require("../utils/asyncHandler");
const cashierService = require("../services/cashierService");

const getEntries = asyncHandler(async (req, res) => {
  const data = await cashierService.getEntries({
    user: req.user,
    date: req.query.date,
    department: req.query.department,
    search: req.query.search
  });

  res.status(200).json({ success: true, data });
});

const getSummary = asyncHandler(async (req, res) => {
  const data = await cashierService.getSummary({
    user: req.user,
    date: req.query.date,
    department: req.query.department,
    search: req.query.search
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

module.exports = {
  getEntries,
  getSummary,
  createEntry,
  updateEntry,
  deleteEntry
};
