const express = require("express");
const jwt = require("jsonwebtoken");
const tvController = require("../controllers/tvController");
const User = require("../models/User");
const { protect } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const AppError = require("../utils/AppError");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();

const protectTvStream = asyncHandler(async (req, res, next) => {
  const token =
    String(req.query.token || "").trim() ||
    (req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.split(" ")[1]
      : "");

  if (!token) {
    throw new AppError("Ruxsat yo'q, token topilmadi", 401);
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw new AppError("Token noto'g'ri yoki muddati tugagan", 401);
  }

  const user = await User.findById(decoded.id).select("-password");
  if (!user) {
    throw new AppError("Token uchun foydalanuvchi topilmadi", 401);
  }

  req.user = user;
  next();
});

router.get(
  "/lor-queue/stream",
  protectTvStream,
  allowRoles("tv"),
  tvController.streamLorQueue
);

router.use(protect);

router.post("/lor-current", allowRoles("lor"), tvController.setLorCurrentPatient);
router.get("/lor-queue", allowRoles("tv", "cashier", "manager", "lor"), tvController.getLorQueue);

module.exports = router;
