const jwt = require("jsonwebtoken");
const User = require("../models/User");
const AppError = require("../utils/AppError");

// TV ekrani kun-u tun ochiq turadi, shuning uchun uning tokeni uzoqroq amal qiladi.
const getTokenExpiresIn = (role) =>
  role === "tv"
    ? process.env.JWT_TV_EXPIRES_IN || "365d"
    : process.env.JWT_EXPIRES_IN || "1d";

const createToken = (user) =>
  jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: getTokenExpiresIn(user.role)
  });

const login = async ({ email, password }) => {
  if (!email || !password) {
    throw new AppError("Email va parol majburiy", 400);
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() }).select(
    "+password"
  );

  if (!user || !(await user.comparePassword(password))) {
    throw new AppError("Email yoki parol noto'g'ri", 401);
  }

  const token = createToken(user);

  return {
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role
    }
  };
};

module.exports = { login };
