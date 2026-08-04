const mongoose = require("mongoose");

const lorQueueTicketSchema = new mongoose.Schema(
  {
    queueCode: {
      type: String,
      required: true,
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
    status: {
      type: String,
      enum: ["waiting", "in_progress", "completed", "cancelled"],
      required: true,
      default: "waiting",
      index: true
    },
    idempotencyKey: {
      type: String,
      trim: true,
      maxlength: 120
    },
    patient: {
      firstName: {
        type: String,
        trim: true,
        default: ""
      },
      lastName: {
        type: String,
        trim: true,
        default: ""
      },
      fullName: {
        type: String,
        trim: true,
        default: ""
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
        default: ""
      }
    },
    createdBy: {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
      },
      role: {
        type: String,
        enum: ["cashier"],
        required: true
      },
      name: {
        type: String,
        required: true
      }
    },
    calledBy: {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      },
      role: {
        type: String,
        enum: ["lor"]
      },
      name: {
        type: String,
        trim: true,
        default: ""
      }
    },
    calledAt: {
      type: Date,
      default: null,
      index: true
    },
    completedAt: {
      type: Date,
      default: null,
      index: true
    },
    cancelledAt: {
      type: Date,
      default: null,
      index: true
    },
    cancelReason: {
      type: String,
      enum: ["", "patient_absent", "wrong_direction", "patient_left", "other"],
      trim: true,
      default: ""
    },
    cancelNote: {
      type: String,
      trim: true,
      maxlength: 200,
      default: ""
    },
    cancelledBy: {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      },
      role: {
        type: String,
        enum: ["lor"]
      },
      name: {
        type: String,
        trim: true,
        default: ""
      }
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
    }
  },
  {
    timestamps: true
  }
);

lorQueueTicketSchema.index({ shiftDate: 1, lorIdentity: 1, queueCode: 1 }, { unique: true });
lorQueueTicketSchema.index(
  { "createdBy.userId": 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      idempotencyKey: { $type: "string" }
    }
  }
);
lorQueueTicketSchema.index({ checkRef: 1 }, { unique: true, sparse: true });
lorQueueTicketSchema.index(
  { shiftDate: 1, lorIdentity: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: "in_progress" } }
);
lorQueueTicketSchema.index({ lorIdentity: 1, status: 1, createdAt: 1 });
lorQueueTicketSchema.index({ shiftDate: 1, lorIdentity: 1, status: 1, cancelReason: 1 });

module.exports = mongoose.model("LorQueueTicket", lorQueueTicketSchema);
