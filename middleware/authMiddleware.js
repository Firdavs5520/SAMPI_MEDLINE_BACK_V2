const jwt = require("jsonwebtoken");
const User = require("../models/User");
const AppError = require("../utils/AppError");
const asyncHandler = require("../utils/asyncHandler");

const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer ")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    throw new AppError("Ruxsat yo'q, token topilmadi", 401);
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    throw new AppError("Token noto'g'ri yoki muddati tugagan", 401);
  }

  const user = await User.findById(decoded.id).select("-password");
  if (!user) {
    throw new AppError("Token uchun foydalanuvchi topilmadi", 401);
  }

  req.user = user;
  next();
});

module.exports = { protect };
