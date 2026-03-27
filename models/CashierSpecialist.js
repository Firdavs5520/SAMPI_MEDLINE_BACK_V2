const mongoose = require("mongoose");

const cashierSpecialistSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    type: {
      type: String,
      enum: ["nurse", "lor"],
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

cashierSpecialistSchema.index({ name: 1, type: 1 }, { unique: true });

module.exports = mongoose.model("CashierSpecialist", cashierSpecialistSchema);
