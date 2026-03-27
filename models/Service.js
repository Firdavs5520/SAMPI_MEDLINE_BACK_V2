const mongoose = require("mongoose");

const priceRangeValidator = {
  validator(value) {
    return (
      value === undefined ||
      value === null ||
      (typeof value === "number" && Number.isFinite(value) && value > 0 && value < 1000000)
    );
  },
  message: "Price must be > 0 and < 1,000,000"
};

const nursePriceOptionsSchema = new mongoose.Schema(
  {
    first: {
      type: Number,
      validate: priceRangeValidator
    },
    second: {
      type: Number,
      validate: priceRangeValidator
    },
    third: {
      type: Number,
      validate: priceRangeValidator
    }
  },
  { _id: false }
);

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
        enum: ["nurse", "lor", "manager", "cashier"],
        required: true
      },
      name: {
        type: String,
        required: true
      }
    },
    priceOptions: {
      type: nursePriceOptionsSchema,
      default: undefined
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

serviceSchema.pre("validate", function validateNursePriceOptions(next) {
  if (this.type !== "nurse") {
    return next();
  }

  const options = this.priceOptions || {};
  const first = Number(options.first);
  const second = Number(options.second);
  const third = Number(options.third);
  const fallbackPrice = Number(this.price);

  const hasFallback =
    Number.isFinite(fallbackPrice) && fallbackPrice > 0 && fallbackPrice < 1000000;

  const isValid =
    Number.isFinite(first) &&
    first > 0 &&
    first < 1000000 &&
    Number.isFinite(second) &&
    second > 0 &&
    second < 1000000 &&
    Number.isFinite(third) &&
    third > 0 &&
    third < 1000000;

  if (!isValid && hasFallback) {
    this.priceOptions = {
      first: fallbackPrice,
      second: fallbackPrice,
      third: fallbackPrice
    };
    this.price = fallbackPrice;
    return next();
  }

  if (!isValid && !hasFallback) {
    return next(
      new Error("Nurse service must include first, second and third prices")
    );
  }

  this.priceOptions = { first, second, third };
  // Keep backward compatibility with code that reads service.price.
  this.price = first;

  return next();
});

serviceSchema.index({ name: 1, type: 1 }, { unique: true });

module.exports = mongoose.model("Service", serviceSchema);

