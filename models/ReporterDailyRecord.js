const mongoose = require("mongoose");

const amountField = {
  type: Number,
  min: 0,
  default: 0
};

const userStampSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    role: {
      type: String,
      enum: ["reporter", "manager"]
    },
    name: {
      type: String,
      trim: true
    }
  },
  { _id: false }
);

const reporterDailyRecordSchema = new mongoose.Schema(
  {
    dateKey: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: /^\d{4}-\d{2}-\d{2}$/
    },
    reportDate: {
      type: Date,
      required: true,
      index: true
    },
    expenseAmount: amountField,
    supplyAmount: amountField,
    medicineAmount: amountField,
    stationeryAmount: amountField,
    communicationAmount: amountField,
    childrenAmount: amountField,
    homeAmount: amountField,
    bossAmount: amountField,
    terminalAmount: amountField,
    transferAmount: amountField,
    clickAmount: amountField,
    debtAmount: amountField,
    note: {
      type: String,
      trim: true,
      maxlength: 500,
      default: ""
    },
    createdBy: {
      type: userStampSchema,
      default: null
    },
    updatedBy: {
      type: userStampSchema,
      default: null
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("ReporterDailyRecord", reporterDailyRecordSchema);
