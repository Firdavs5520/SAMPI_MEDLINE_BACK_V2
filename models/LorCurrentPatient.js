const mongoose = require("mongoose");

const lorCurrentPatientSchema = new mongoose.Schema(
  {
    queueCode: {
      type: String,
      required: true,
      trim: true
    },
    lorIdentity: {
      type: String,
      enum: ["lor1"],
      required: true,
      default: "lor1",
      index: true
    },
    patient: {
      firstName: {
        type: String,
        trim: true,
        required: true
      },
      lastName: {
        type: String,
        trim: true,
        required: true
      },
      fullName: {
        type: String,
        trim: true,
        required: true
      }
    },
    doctor: {
      specialistId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "CashierSpecialist"
      },
      name: {
        type: String,
        trim: true,
        required: true
      }
    },
    acceptedBy: {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
      },
      name: {
        type: String,
        required: true
      },
      role: {
        type: String,
        enum: ["lor"],
        required: true
      }
    },
    acceptedAt: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: true
  }
);

lorCurrentPatientSchema.index({ lorIdentity: 1, acceptedAt: -1 });

module.exports = mongoose.model("LorCurrentPatient", lorCurrentPatientSchema);
