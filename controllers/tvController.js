const asyncHandler = require("../utils/asyncHandler");
const tvService = require("../services/tvService");

const setLorCurrentPatient = asyncHandler(async (req, res) => {
  const data = await tvService.setLorCurrentPatient({
    user: req.user,
    patient: req.body.patient,
    lorIdentity: req.body.lorIdentity,
    specialistId: req.body.specialistId,
    specialistName: req.body.specialistName
  });

  res.status(201).json({ success: true, data });
});

const getLorQueue = asyncHandler(async (req, res) => {
  const data = await tvService.getLorQueue({
    date: req.query.date,
    lorIdentity: req.query.lorIdentity,
    limit: req.query.limit
  });

  res.status(200).json({ success: true, data });
});

module.exports = {
  setLorCurrentPatient,
  getLorQueue
};
