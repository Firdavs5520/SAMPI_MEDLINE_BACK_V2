const AppError = require("../utils/AppError");

const allowRoles = (...roles) => (req, res, next) => {
  if (!req.user) {
    return next(new AppError("Not authorized", 401));
  }

  if (!roles.includes(req.user.role)) {
    return next(new AppError("Access denied for this role", 403));
  }

  next();
};

module.exports = { allowRoles };
