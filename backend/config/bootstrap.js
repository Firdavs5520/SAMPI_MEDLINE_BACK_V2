const User = require("../models/User");

const defaultUsers = [
  {
    name: "Hamshira",
    email: "nurse@mail.com",
    role: "nurse"
  },
  {
    name: "LOR shifokor",
    email: "lor@mail.com",
    role: "lor"
  },
  {
    name: "Yetkazuvchi",
    email: "delivery@mail.com",
    role: "delivery"
  },
  {
    name: "Menejer",
    email: "manager@mail.com",
    role: "manager"
  },
  {
    name: "Kassir",
    email: "cashier@mail.com",
    role: "cashier"
  }
];

const bootstrapDefaultUsers = async () => {
  const shouldSeed = process.env.SEED_DEFAULT_USERS === "true";
  if (!shouldSeed) return;

  const defaultPassword = process.env.DEFAULT_PASSWORD || "Passw0rd!";

  for (const userData of defaultUsers) {
    const exists = await User.findOne({ email: userData.email });
    if (!exists) {
      await User.create({
        ...userData,
        password: defaultPassword
      });
      continue;
    }

    const shouldUpdate = exists.name !== userData.name || exists.role !== userData.role;
    if (shouldUpdate) {
      exists.name = userData.name;
      exists.role = userData.role;
      await exists.save();
    }
  }
};

module.exports = bootstrapDefaultUsers;
