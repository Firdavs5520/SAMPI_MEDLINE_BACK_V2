const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const authRoutes = require("./routes/authRoutes");
const medicineRoutes = require("./routes/medicineRoutes");
const serviceRoutes = require("./routes/serviceRoutes");
const usageRoutes = require("./routes/usageRoutes");
const reportRoutes = require("./routes/reportRoutes");
const cashierRoutes = require("./routes/cashierRoutes");
const reporterRoutes = require("./routes/reporterRoutes");
const tvRoutes = require("./routes/tvRoutes");
const { getHealthPayload } = require("./services/monitoringService");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");

const app = express();

// Render kabi hostinglarda so'rov bitta proxy orqali keladi; req.ip haqiqiy
// mijoz IP manzili bo'lishi uchun (login cheklovi shunga tayanadi).
app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS || 1));

const normalizeOrigin = (value) =>
  String(value || "")
    .trim()
    .replace(/\/+$/, "")
    .toLowerCase();

const sanitizeLogUrl = (value) => {
  try {
    const url = new URL(value || "/", "http://sampi.local");
    ["token", "streamToken", "access_token"].forEach((key) => {
      if (url.searchParams.has(key)) {
        url.searchParams.set(key, "[redacted]");
      }
    });
    return `${url.pathname}${url.search}`;
  } catch {
    return String(value || "").replace(
      /(token|streamToken|access_token)=([^&\s]+)/gi,
      "$1=[redacted]"
    );
  }
};

const defaultOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost",
  "https://localhost",
  "capacitor://localhost",
  "https://sampi-medline.vercel.app"
];
const envOrigins = process.env.CLIENT_ORIGIN
  ? process.env.CLIENT_ORIGIN.split(",").map((item) => item.trim())
  : [];
const envVercelOrigins = process.env.VERCEL_ALLOWED_ORIGINS
  ? process.env.VERCEL_ALLOWED_ORIGINS.split(",").map((item) => item.trim())
  : [];
const allowVercelOrigins = String(process.env.ALLOW_VERCEL_ORIGINS || "false") === "true";
const allowedVercelOrigins = new Set(
  envVercelOrigins.map(normalizeOrigin).filter(Boolean)
);
const allowedOrigins = new Set(
  [...defaultOrigins, ...envOrigins].map(normalizeOrigin).filter(Boolean)
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      const normalizedOrigin = normalizeOrigin(origin);
      const isVercelOrigin = allowVercelOrigins && allowedVercelOrigins.has(normalizedOrigin);

      if (allowedOrigins.has(normalizedOrigin) || isVercelOrigin) {
        callback(null, true);
        return;
      }

      callback(new Error("CORS policy: origin not allowed"));
    },
    credentials: true
  })
);
app.use(express.json());
morgan.token("safe-url", (req) => sanitizeLogUrl(req.originalUrl || req.url));
if (process.env.NODE_ENV !== "test") {
  app.use(morgan(":method :safe-url :status :res[content-length] - :response-time ms"));
}

app.get("/health", (req, res) => {
  res.status(200).json(getHealthPayload());
});

app.use("/api/auth", authRoutes);
app.use("/api/medicines", medicineRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/usage", usageRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/cashier", cashierRoutes);
app.use("/api/reporter", reporterRoutes);
app.use("/api/tv", tvRoutes);

// Backward-compatible routes (for old frontend builds without `/api` prefix).
app.use("/auth", authRoutes);
app.use("/medicines", medicineRoutes);
app.use("/services", serviceRoutes);
app.use("/usage", usageRoutes);
app.use("/reports", reportRoutes);
app.use("/cashier", cashierRoutes);
app.use("/reporter", reporterRoutes);
app.use("/tv", tvRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
