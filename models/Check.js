const mongoose = require("mongoose");

const checkItemSchema = new mongoose.Schema(
  {
    itemType: {
      type: String,
      enum: ["medicine", "service"],
      required: true,
      immutable: true
    },
    name: {
      type: String,
      required: true,
      immutable: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      immutable: true
    },
    price: {
      type: Number,
      required: true,
      min: 0.01,
      max: 999999.99,
      immutable: true
    }
  },
  { _id: false }
);

const checkSchema = new mongoose.Schema(
  {
    checkId: {
      type: String,
      required: true,
      unique: true,
      immutable: true
    },
    type: {
      type: String,
      enum: ["medicine", "service", "mixed"],
      required: true,
      immutable: true
    },
    items: {
      type: [checkItemSchema],
      validate: {
        validator: (val) => Array.isArray(val) && val.length > 0,
        message: "Check must include at least one item"
      },
      immutable: true
    },
    total: {
      type: Number,
      required: true,
      min: 0.01,
      immutable: true
    },
    patient: {
      firstName: {
        type: String,
        trim: true,
        immutable: true
      },
      lastName: {
        type: String,
        trim: true,
        immutable: true
      },
      fullName: {
        type: String,
        trim: true,
        immutable: true
      }
    },
    createdBy: {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        immutable: true
      },
      role: {
        type: String,
        enum: ["nurse", "lor", "delivery", "manager", "cashier"],
        required: true,
        immutable: true
      },
      name: {
        type: String,
        required: true,
        immutable: true
      },
      lorIdentity: {
        type: String,
        enum: ["lor1", "lor2"],
        immutable: true
      }
    },
    createdAt: {
      type: Date,
      default: Date.now,
      immutable: true
    }
  },
  {
    versionKey: false
  }
);

const immutableError = () => {
  throw new Error("Checks are immutable and cannot be modified or deleted");
};

checkSchema.pre("findOneAndUpdate", immutableError);
checkSchema.pre("updateOne", immutableError);
checkSchema.pre("updateMany", immutableError);
checkSchema.pre("replaceOne", immutableError);
checkSchema.pre("findOneAndDelete", immutableError);
checkSchema.pre("deleteOne", immutableError);
checkSchema.pre("deleteMany", immutableError);

module.exports = mongoose.model("Check", checkSchema);

