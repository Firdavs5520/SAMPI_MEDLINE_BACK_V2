const mongoose = require("mongoose");

const medicineSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    createdBy: {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
      },
      role: {
        type: String,
        enum: ["nurse", "lor", "delivery", "manager"],
        required: true
      },
      name: {
        type: String,
        required: true
      }
    },
    stock: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },
    price: {
      type: Number,
      required: true,
      min: 0.01,
      max: 999999.99
    },
    isArchived: {
      type: Boolean,
      default: false,
      index: true
    }
  },
  {
    timestamps: true
  }
);

medicineSchema.index({ name: 1 }, { unique: true });

module.exports = mongoose.model("Medicine", medicineSchema);
