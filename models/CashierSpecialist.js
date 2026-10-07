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
    // Tajribali (pro) doktor: LOR doktor tanlash sahifasida o'rtada, alohida ko'rinadi.
    pro: {
      type: Boolean,
      default: false
    },
    createdBy: {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
      },
      role: {
        type: String,
        enum: ["cashier", "manager", "nurse", "lor"],
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
