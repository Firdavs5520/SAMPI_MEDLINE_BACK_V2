const AppError = require("../utils/AppError");

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 10;
const failedAttempts = new Map();

const buildKey = (req) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  return `${req.ip || "-"}|${email}`;
};

const pruneExpired = (now) => {
  for (const [key, value] of failedAttempts) {
    if (value.resetAt <= now) failedAttempts.delete(key);
  }
};

// Parolni ketma-ket taxmin qilishni cheklaydi: bir IP + email juftligi uchun
// 15 daqiqada 10 ta noto'g'ri urinish. Muvaffaqiyatli kirish hisobni tozalaydi.
const loginRateLimit = (req, res, next) => {
  const now = Date.now();
  pruneExpired(now);

  const key = buildKey(req);
  const record = failedAttempts.get(key);

  if (record && record.count >= MAX_FAILED_ATTEMPTS) {
    const retryAfterSec = Math.ceil((record.resetAt - now) / 1000);
    res.setHeader("Retry-After", String(retryAfterSec));
    next(
      new AppError(
        `Juda ko'p noto'g'ri urinish. ${Math.ceil(retryAfterSec / 60)} daqiqadan keyin qayta urinib ko'ring`,
        429
      )
    );
    return;
  }

  res.on("finish", () => {
    if (res.statusCode === 401) {
      const current = failedAttempts.get(key);
      if (current && current.resetAt > Date.now()) {
        current.count += 1;
      } else {
        failedAttempts.set(key, { count: 1, resetAt: Date.now() + WINDOW_MS });
      }
    } else if (res.statusCode < 400) {
      failedAttempts.delete(key);
    }
  });

  next();
};

module.exports = { loginRateLimit };
