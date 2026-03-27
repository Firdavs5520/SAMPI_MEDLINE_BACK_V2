const mongoose = require("mongoose");

const serviceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    type: {
      type: String,
      enum: ["nurse", "lor"],
      required: true
    },
    createdBy: {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
      },
      role: {
        type: String,
        enum: ["nurse", "lor", "manager"],
        required: true
      },
      name: {
        type: String,
        required: true
      }
    },
    price: {
      type: Number,
      required: true,
      min: 0.01,
      max: 999999.99
    }
  },
  {
    timestamps: true
  }
);

serviceSchema.index({ name: 1, type: 1 }, { unique: true });

module.exports = mongoose.model("Service", serviceSchema);
