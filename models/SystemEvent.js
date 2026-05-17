const mongoose = require("mongoose");

const systemEventSchema = new mongoose.Schema(
  {
    eventType: {
      type: String,
      enum: ["startup", "error_5xx"],
      required: true,
      index: true
    },
    level: {
      type: String,
      enum: ["info", "error"],
      default: "info"
    },
    message: {
      type: String,
      required: true,
      trim: true
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  { versionKey: false }
);

systemEventSchema.index({ createdAt: -1, eventType: 1 });

module.exports = mongoose.model("SystemEvent", systemEventSchema);
