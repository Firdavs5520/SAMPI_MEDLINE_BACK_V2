const asyncHandler = require("../utils/asyncHandler");
const authService = require("../services/authService");

const login = asyncHandler(async (req, res) => {
  const payload = await authService.login(req.body);
  res.status(200).json({
    success: true,
    data: payload
  });
});

module.exports = { login };
