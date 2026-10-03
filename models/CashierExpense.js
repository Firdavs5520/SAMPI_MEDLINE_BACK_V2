const mongoose = require("mongoose");

const actorSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    role: {
      type: String,
      enum: ["cashier", "manager"],
      required: true
    },
    name: {
      type: String,
      required: true
    }
  },
  { _id: false }
);

// Kassadan chiqqan kutilmagan xarajat (masalan, xo'jalik mollari, yetkazib berish).
const cashierExpenseSchema = new mongoose.Schema(
  {
    amount: {
      type: Number,
      required: true,
      min: 1,
      max: 99999999
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300
    },
    paymentMethod: {
      type: String,
      enum: ["cash", "card", "transfer"],
      default: "cash"
    },
    // Smena sanasi (YYYY-MM-DD, kassa smenasi bo'yicha), hisobotlar shu bo'yicha guruhlanadi.
    shiftDate: {
      type: String,
      required: true,
      index: true
    },
    createdBy: {
      type: actorSchema,
      required: true
    },
    canceledAt: {
      type: Date,
      default: null
    },
    canceledBy: {
      type: actorSchema,
      default: undefined
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

cashierExpenseSchema.index({ shiftDate: 1, createdAt: -1 });

module.exports = mongoose.model("CashierExpense", cashierExpenseSchema);
