// Testlar uchun umumiy muhit: in-memory MongoDB replica set (tranzaksiyalar
// uchun kerak) + Express ilovasi tasodifiy portda + demo foydalanuvchilar.
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const mongoose = require("mongoose");

const PASSWORD = "Test1234";

const startTestServer = async () => {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.NODE_ENV = "test";
  process.env.MONGO_URI = replSet.getUri("sampi_test");
  process.env.JWT_SECRET = "test_secret";
  process.env.JWT_EXPIRES_IN = "1d";
  process.env.SEED_DEFAULT_USERS = "true";
  process.env.DEFAULT_PASSWORD = PASSWORD;

  const connectDB = require("../config/db");
  const bootstrapDefaultUsers = require("../config/bootstrap");
  const app = require("../app");

  await connectDB();
  await bootstrapDefaultUsers();
  // Yangi bazada kolleksiya/indekslar tayyor bo'lmasa tranzaksiyalar "catalog
  // changes" xatosini beradi; ishlab turgan bazada bu muammo yo'q.
  for (const model of Object.values(mongoose.models)) {
    await model.createCollection();
    await model.init();
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;

  const call = async (method, url, { token, body, headers = {} } = {}) => {
    const res = await fetch(`${base}${url}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, body: json, data: json?.data };
  };

  const login = async (email) => {
    const res = await call("POST", "/auth/login", { body: { email, password: PASSWORD } });
    if (res.status !== 200) throw new Error(`Login xatosi ${email}: ${JSON.stringify(res.body)}`);
    return res.data.token;
  };

  const stop = async () => {
    server.close();
    await mongoose.disconnect();
    await replSet.stop();
  };

  return { base, call, login, stop };
};

module.exports = { startTestServer, PASSWORD };
