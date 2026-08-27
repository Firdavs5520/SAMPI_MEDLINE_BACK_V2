const mongoose = require("mongoose");

const stockOperationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    idempotencyKey: {
      type: String,
      required: true,
      trim: true
    },
    medicineIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Medicine",
        required: true
      }
    ],
    createdBy: {
      role: {
        type: String,
        enum: ["delivery"],
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

stockOperationSchema.index(
  { userId: 1, idempotencyKey: 1 },
  { unique: true }
);

module.exports = mongoose.model("StockOperation", stockOperationSchema);
