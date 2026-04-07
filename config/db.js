const mongoose = require("mongoose");

const normalizeMongoUri = (rawValue) => {
  let value = String(rawValue || "").trim();

  if (!value) {
    return "";
  }

  // Common Render mistake: putting `MONGO_URI=...` inside the VALUE field.
  value = value.replace(/^MONGO_URI\s*=\s*/i, "");

  // Strip matching quote wrappers if present.
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith("`") && value.endsWith("`"))
  ) {
    value = value.slice(1, -1).trim();
  }

  // Remove accidental whitespace/newlines pasted with the URI.
  value = value.replace(/\s+/g, "");

  return value;
};

const connectDB = async () => {
  const mongoUri = normalizeMongoUri(process.env.MONGO_URI || process.env.MONGODB_URI);

  if (!mongoUri) {
    throw new Error("MONGO_URI muhit o'zgaruvchilarida ko'rsatilmagan");
  }

  if (!mongoUri.startsWith("mongodb://") && !mongoUri.startsWith("mongodb+srv://")) {
    throw new Error(
      "MONGO_URI formati noto'g'ri. URI \"mongodb://\" yoki \"mongodb+srv://\" bilan boshlanishi kerak"
    );
  }

  await mongoose.connect(mongoUri);
};

module.exports = connectDB;
