const mongoose = require("mongoose");

const cashierSettingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "default"
    },
    shiftStartTime: {
      type: String,
      required: true,
      default: "08:00"
    },
    shiftEndTime: {
      type: String,
      required: true,
      default: "02:00"
    },
    lateEntryWarningMinutes: {
      type: Number,
      required: true,
      default: 30,
      min: 0,
      max: 720
    },
    requireDebtPhone: {
      type: Boolean,
      required: true,
      default: true
    },
    updatedBy: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      name: String,
      role: String
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("CashierSettings", cashierSettingsSchema);
