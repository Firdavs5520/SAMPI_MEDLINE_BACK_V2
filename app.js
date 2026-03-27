const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const authRoutes = require("./routes/authRoutes");
const medicineRoutes = require("./routes/medicineRoutes");
const serviceRoutes = require("./routes/serviceRoutes");
const usageRoutes = require("./routes/usageRoutes");
const reportRoutes = require("./routes/reportRoutes");
const cashierRoutes = require("./routes/cashierRoutes");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");

const app = express();

const normalizeOrigin = (value) =>
  String(value || "")
    .trim()
    .replace(/\/+$/, "")
    .toLowerCase();

const defaultOrigins = ["http://localhost:5173", "http://127.0.0.1:5173"];
const envOrigins = process.env.CLIENT_ORIGIN
  ? process.env.CLIENT_ORIGIN.split(",").map((item) => item.trim())
  : [];
const allowVercelOrigins = String(process.env.ALLOW_VERCEL_ORIGINS || "true") !== "false";
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
      const isVercelOrigin =
        allowVercelOrigins && normalizedOrigin.startsWith("https://") && normalizedOrigin.endsWith(".vercel.app");

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
app.use(morgan("dev"));

app.get("/health", (req, res) => {
  res.status(200).json({ success: true, message: "Sampi Medline API is running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/medicines", medicineRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/usage", usageRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/cashier", cashierRoutes);

// Backward-compatible routes (for old frontend builds without `/api` prefix).
app.use("/auth", authRoutes);
app.use("/medicines", medicineRoutes);
app.use("/services", serviceRoutes);
app.use("/usage", usageRoutes);
app.use("/reports", reportRoutes);
app.use("/cashier", cashierRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
