const mongoose = require("mongoose");

const cashierEntrySchema = new mongoose.Schema(
  {
    department: {
      type: String,
      enum: ["lor", "procedure"],
      required: true,
      index: true
    },
    patientName: {
      type: String,
      required: true,
      trim: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
      max: 999999.99
    },
    specialistName: {
      type: String,
      required: true,
      trim: true
    },
    patientPhone: {
      type: String,
      trim: true,
      default: ""
    },
    note: {
      type: String,
      trim: true,
      default: ""
    },
    entryDate: {
      type: Date,
      required: true,
      index: true
    },
    createdBy: {
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
    }
  },
  {
    timestamps: true
  }
);

cashierEntrySchema.index({ entryDate: 1, department: 1, createdAt: 1 });
cashierEntrySchema.index({ patientName: "text", specialistName: "text", patientPhone: "text" });

module.exports = mongoose.model("CashierEntry", cashierEntrySchema);
