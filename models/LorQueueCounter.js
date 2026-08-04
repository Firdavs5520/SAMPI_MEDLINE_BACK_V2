const mongoose = require("mongoose");

const lorQueueCounterSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    shiftDate: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    lorIdentity: {
      type: String,
      enum: ["lor1"],
      required: true,
      default: "lor1",
      index: true
    },
    sequence: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("LorQueueCounter", lorQueueCounterSchema);
