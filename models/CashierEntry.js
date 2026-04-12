const mongoose = require("mongoose");

const cashierEntrySchema = new mongoose.Schema(
  {
    source: {
      type: String,
      enum: ["manual", "check"],
      default: "manual",
      index: true
    },
    checkRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Check",
      default: null
    },
    checkCode: {
      type: String,
      trim: true,
      default: ""
    },
    department: {
      type: String,
      enum: ["lor", "nurse", "procedure"],
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
    specialistType: {
      type: String,
      enum: ["nurse", "lor"],
      default: "lor",
      index: true
    },
    specialistId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CashierSpecialist"
    },
    paymentMethod: {
      type: String,
      enum: ["cash", "card", "transfer"],
      default: "cash",
      index: true
    },
    paidAmount: {
      type: Number,
      min: 0,
      default: 0
    },
    debtAmount: {
      type: Number,
      min: 0,
      default: 0,
      index: true
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

cashierEntrySchema.index({ entryDate: 1, department: 1, specialistType: 1, createdAt: 1 });
cashierEntrySchema.index({ patientName: "text", specialistName: "text", patientPhone: "text" });
cashierEntrySchema.index({ checkRef: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("CashierEntry", cashierEntrySchema);
