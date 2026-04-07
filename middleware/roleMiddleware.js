const AppError = require("../utils/AppError");

const allowRoles = (...roles) => (req, res, next) => {
  if (!req.user) {
    return next(new AppError("Ruxsat yo'q", 401));
  }

  if (!roles.includes(req.user.role)) {
    return next(new AppError("Bu rol uchun ruxsat yo'q", 403));
  }

  next();
};

module.exports = { allowRoles };
