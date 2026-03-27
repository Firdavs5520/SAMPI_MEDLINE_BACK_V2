const User = require("../models/User");

const defaultUsers = [
  {
    name: "Nurse User",
    email: "nurse@mail.com",
    role: "nurse"
  },
  {
    name: "LOR Doctor",
    email: "lor@mail.com",
    role: "lor"
  },
  {
    name: "Delivery User",
    email: "delivery@mail.com",
    role: "delivery"
  },
  {
    name: "Manager User",
    email: "manager@mail.com",
    role: "manager"
  },
  {
    name: "Cashier User",
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
    }
  }
};

module.exports = bootstrapDefaultUsers;
