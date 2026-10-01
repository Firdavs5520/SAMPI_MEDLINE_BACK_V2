const express = require("express");
const authController = require("../controllers/authController");
const { loginRateLimit } = require("../middleware/loginRateLimit");

const router = express.Router();

router.post("/login", loginRateLimit, authController.login);

module.exports = router;
