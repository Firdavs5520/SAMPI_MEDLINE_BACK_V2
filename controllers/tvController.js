const asyncHandler = require("../utils/asyncHandler");
const tvService = require("../services/tvService");

const getLorQueue = asyncHandler(async (req, res) => {
  const data = await tvService.getLorQueue({
    date: req.query.date,
    lorIdentity: req.query.lorIdentity,
    limit: req.query.limit
  });

  res.status(200).json({ success: true, data });
});

module.exports = {
  getLorQueue
};
