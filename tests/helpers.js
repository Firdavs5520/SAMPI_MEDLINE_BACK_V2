// Testlar uchun umumiy muhit: in-memory MongoDB replica set (tranzaksiyalar
// uchun kerak) + Express ilovasi tasodifiy portda + demo foydalanuvchilar.
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const mongoose = require("mongoose");

const PASSWORD = "Test1234";
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

// Kassa smenasi 08:00-02:00 (Toshkent). Testlar tunda (02:00-08:00) ishga tushsa, "hozir"
// yaratilgan yozuvlar hech qaysi smenaga tushmay, smena hisobotlari 0 qaytarardi. Shuning
// uchun test jarayonida soat bugungi Toshkent 12:00 ga suriladi (soat yurishda davom etadi).
// Server ham shu jarayonda ishlaydi, demak u ham xuddi shu "hozir"ni ko'radi.
const useDaytimeClock = () => {
  const RealDate = Date;
  const realNow = RealDate.now();
  const tashkentDay = new RealDate(realNow + TASHKENT_OFFSET_MS).toISOString().slice(0, 10);
  const middayUtc = RealDate.parse(`${tashkentDay}T12:00:00.000Z`) - TASHKENT_OFFSET_MS;
  const offset = middayUtc - realNow;

  // Nomi "Date" bo'lishi shart: mongoose sxemadagi `type: Date` ni funksiya nomidan taniydi.
  const DaytimeDate = class Date extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(RealDate.now() + offset);
      else super(...args);
    }

    static now() {
      return RealDate.now() + offset;
    }
  };

  globalThis.Date = DaytimeDate;
};

const startTestServer = async () => {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  useDaytimeClock();
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
