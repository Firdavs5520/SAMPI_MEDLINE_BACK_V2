const mongoose = require("mongoose");

// Ombor qoldig'idagi qo'lda qilingan har bir o'zgarish (kirim yoki qoldiqni
// to'g'ridan-to'g'ri o'rnatish) kim, qachon va qanchaga o'zgartirgani bilan.
const stockAdjustmentSchema = new mongoose.Schema(
  {
    medicineId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Medicine",
      required: true,
      index: true
    },
    medicineName: {
      type: String,
      trim: true,
      default: ""
    },
    type: {
      type: String,
      enum: ["increase", "set"],
      required: true
    },
    previousStock: {
      type: Number,
      required: true
    },
    newStock: {
      type: Number,
      required: true
    },
    delta: {
      type: Number,
      required: true
    },
    adjustedBy: {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      },
      role: String,
      name: String
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  { versionKey: false }
);

module.exports = mongoose.model("StockAdjustment", stockAdjustmentSchema);
