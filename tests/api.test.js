const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const EventEmitter = require("events");
const mongoose = require("mongoose");
const { startTestServer } = require("./helpers");

// lorQueueEvents ichidagi EventEmitter'ni topish (SSE tinglovchilarini sanash uchun).
let queueEmitter = null;
const originalOn = EventEmitter.prototype.on;
EventEmitter.prototype.on = function trackQueueEmitter(event, listener) {
  if (event === "lor-queue:changed") queueEmitter = this;
  return originalOn.call(this, event, listener);
};

let ctx;
const tokens = {};
const fixtures = {};

before(async () => {
  ctx = await startTestServer();
  for (const role of ["nurse", "lor", "cashier", "manager", "delivery", "tv", "reporter"]) {
    tokens[role] = await ctx.login(`${role}@mail.com`);
  }

  const { call } = ctx;
  fixtures.nurseSpecialist = (
    await call("POST", "/usage/specialists", { token: tokens.nurse, body: { name: "Malika" } })
  ).data;
  fixtures.medicine = (
    await call("POST", "/medicines", { token: tokens.nurse, body: { name: "Paracetamol", price: 5000 } })
  ).data;
  await call("PATCH", `/medicines/${fixtures.medicine._id}/increase`, {
    token: tokens.delivery,
    body: { quantity: 100 }
  });
  fixtures.nurseService = (
    await call("POST", "/services", {
      token: tokens.nurse,
      body: { name: "Ukol", type: "nurse", priceOptions: { first: 20000, second: 15000, third: 10000 } }
    })
  ).data;
  fixtures.lorDoctor = (
    await call("POST", "/usage/specialists", { token: tokens.lor, body: { name: "Dr. Karimov" } })
  ).data;
  fixtures.lorService = (
    await call("POST", "/services", { token: tokens.lor, body: { name: "Ko'rik", type: "lor", price: 100000 } })
  ).data;
});

after(async () => {
  await ctx?.stop();
});

const nurseCheckout = ({ key, firstName = "Ali", quantity = 2 } = {}) =>
  ctx.call("POST", "/usage/checkout", {
    token: tokens.nurse,
    headers: key ? { "X-Idempotency-Key": key } : {},
    body: {
      medicines: [{ medicineId: fixtures.medicine._id, quantity }],
      services: [{ serviceId: fixtures.nurseService._id, quantity: 1, priceTier: "second" }],
      patient: { firstName, lastName: "Valiyev" },
      specialistId: fixtures.nurseSpecialist._id
    }
  });

const daysAgo = (days) => new Date(Date.now() - days * 86400000);

// --- Smena sanasi -----------------------------------------------------------

test("smena sanasi: 00:00-02:00 hali oldingi smena", async () => {
  const settings = require("../services/cashierSettingsService");
  // UTC 20:30 = Toshkent 01:30
  assert.equal(await settings.getCurrentShiftDate(new Date("2026-10-01T20:30:00Z")), "2026-10-01");
  assert.equal(await settings.getCurrentShiftDate(new Date("2026-10-01T21:00:00Z")), "2026-10-02");
  assert.equal(await settings.getCurrentShiftDate(new Date("2026-10-02T09:00:00Z")), "2026-10-02");
});

// --- Autentifikatsiya -------------------------------------------------------

test("login: 10 ta noto'g'ri urinishdan keyin 429, boshqa email bloklanmaydi", async () => {
  for (let i = 0; i < 10; i += 1) {
    const res = await ctx.call("POST", "/auth/login", { body: { email: "x@mail.com", password: "bad" } });
    assert.equal(res.status, 401);
  }
  const blocked = await ctx.call("POST", "/auth/login", { body: { email: "x@mail.com", password: "bad" } });
  assert.equal(blocked.status, 429);
  await ctx.login("nurse@mail.com");
});

test("TV tokeni uzoq muddatli", () => {
  const payload = JSON.parse(Buffer.from(tokens.tv.split(".")[1], "base64url").toString());
  assert.ok(payload.exp - payload.iat >= 364 * 86400);
});

test("TV stream tokeni oddiy API uchun yaroqsiz", async () => {
  const streamToken = (await ctx.call("GET", "/tv/lor-queue/stream-token", { token: tokens.tv })).data.token;
  const res = await ctx.call("GET", "/tv/lor-queue?lorIdentity=lor1", { token: streamToken });
  assert.equal(res.status, 401);
});

// --- Cheklar ----------------------------------------------------------------

test("kalitsiz cheklar ketma-ket yaratiladi (sparse indeks to'qnashuvi yo'q)", async () => {
  const first = await nurseCheckout();
  const second = await nurseCheckout();
  assert.equal(first.status, 201, JSON.stringify(first.body));
  assert.equal(second.status, 201, JSON.stringify(second.body));
  assert.equal(first.data.check.total, 25000);

  for (let i = 0; i < 2; i += 1) {
    const legacy = await ctx.call("POST", "/usage/medicine", {
      token: tokens.nurse,
      body: { medicineId: fixtures.medicine._id, quantity: 1 }
    });
    assert.equal(legacy.status, 201, JSON.stringify(legacy.body));
  }
});

test("idempotency kaliti takror chek yaratmaydi", async () => {
  const first = await nurseCheckout({ key: "same-key" });
  const second = await nurseCheckout({ key: "same-key" });
  assert.equal(first.data.check.checkId, second.data.check.checkId);
});

test("bir vaqtdagi cheklar bitta dori ustida WriteConflict bermaydi", async () => {
  const Medicine = require("../models/Medicine");
  const before = (await Medicine.findById(fixtures.medicine._id)).stock;
  const results = await Promise.all(
    Array.from({ length: 6 }, (_, i) => nurseCheckout({ key: `concurrent-${i}`, quantity: 1 }))
  );
  results.forEach((res) => assert.equal(res.status, 201, JSON.stringify(res.body)));
  assert.equal((await Medicine.findById(fixtures.medicine._id)).stock, before - 6);
});

test("kasr miqdor rad etiladi", async () => {
  const res = await nurseCheckout({ quantity: 1.5 });
  assert.equal(res.status, 400);
});

test("cheklar ro'yxati limit bilan qaytadi", async () => {
  const res = await ctx.call(
    "GET",
    `/usage/my-checks?specialistId=${fixtures.nurseSpecialist._id}&limit=3`,
    { token: tokens.nurse }
  );
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.data.length, 3);
});

// --- Ombor ------------------------------------------------------------------

test("qoldiq o'zgarishlari tarixga yoziladi", async () => {
  const StockAdjustment = require("../models/StockAdjustment");
  const set = await ctx.call("PATCH", `/medicines/${fixtures.medicine._id}/stock`, {
    token: tokens.delivery,
    body: { stock: 500 }
  });
  assert.equal(set.status, 200, JSON.stringify(set.body));
  assert.equal(set.data.stock, 500);

  const bulk = await ctx.call("PATCH", "/medicines/bulk-increase", {
    token: tokens.delivery,
    headers: { "X-Idempotency-Key": "bulk-1" },
    body: { items: [{ medicineId: fixtures.medicine._id, quantity: 10 }] }
  });
  assert.equal(bulk.status, 200, JSON.stringify(bulk.body));

  const rows = await StockAdjustment.find({ medicineId: fixtures.medicine._id }).sort({ createdAt: 1 }).lean();
  const setRow = rows.find((row) => row.type === "set");
  assert.equal(setRow.newStock, 500);
  assert.equal(setRow.adjustedBy.role, "delivery");
  const bulkRow = rows.at(-1);
  assert.deepEqual([bulkRow.previousStock, bulkRow.newStock, bulkRow.delta], [500, 510, 10]);
});

// --- Kassa va qarz ----------------------------------------------------------

test("kassa: qisman to'lov, takror qabul yo'q, eski qarz 'any' bo'limida", async () => {
  const CashierEntry = require("../models/CashierEntry");
  const check = (await nurseCheckout({ key: "debt-check" })).data.check;

  const accepted = await ctx.call("POST", "/cashier/entries", {
    token: tokens.cashier,
    body: { checkRef: check._id, paidAmount: 10000, paymentMethod: "cash", patientPhone: "+998901234567" }
  });
  assert.equal(accepted.status, 201, JSON.stringify(accepted.body));
  assert.equal(accepted.data.debtAmount, 15000);
  fixtures.debtEntry = accepted.data;

  const again = await ctx.call("POST", "/cashier/entries", {
    token: tokens.cashier,
    body: { checkRef: check._id, paidAmount: 25000 }
  });
  assert.equal(again.status, 400);

  // Yozuvni bir hafta oldingi qilib qo'yamiz (dastlabki to'lov ham o'sha kuni).
  await CashierEntry.collection.updateOne(
    { _id: new mongoose.Types.ObjectId(accepted.data._id) },
    { $set: { entryDate: daysAgo(7), "debtPayments.0.paidAt": daysAgo(7) } }
  );

  const any = await ctx.call("GET", "/cashier/entries?timeScope=any&debtOnly=true", { token: tokens.cashier });
  assert.equal(any.data.entries.length, 1);
  const today = await ctx.call("GET", "/cashier/entries?timeScope=all&debtOnly=true", { token: tokens.cashier });
  assert.equal(today.data.entries.length, 0);
});

test("kassa yozuvini o'chirish/o'zgartirish API'lari yopilgan", async () => {
  const id = fixtures.debtEntry._id;
  assert.equal((await ctx.call("DELETE", `/cashier/entries/${id}`, { token: tokens.cashier })).status, 404);
  assert.equal(
    (await ctx.call("PATCH", `/cashier/entries/${id}`, { token: tokens.cashier, body: { paidAmount: 0 } })).status,
    404
  );
});

test("bir vaqtdagi qarz to'lovlaridan faqat bittasi o'tadi", async () => {
  const CashierEntry = require("../models/CashierEntry");
  const id = fixtures.debtEntry._id;
  const pay = () =>
    ctx.call("POST", `/cashier/entries/${id}/payments`, {
      token: tokens.cashier,
      body: { amount: 15000, paymentMethod: "card" }
    });
  const results = await Promise.all([pay(), pay(), pay()]);
  assert.equal(results.filter((res) => res.status === 200).length, 1);

  const entry = await CashierEntry.findById(id).lean();
  assert.deepEqual([entry.paidAmount, entry.debtAmount, entry.debtPayments.length], [25000, 0, 2]);
});

test("hisobotlar tushumni to'lov sanasi bo'yicha hisoblaydi", async () => {
  const shift = await ctx.call("GET", "/reports/shift-close", { token: tokens.manager });
  assert.equal(shift.data.totals.totalPaidAmount, 15000);
  assert.equal(shift.data.totals.debtRepaymentAmount, 15000);
  assert.equal(shift.data.byPaymentMethod.find((row) => row.paymentMethod === "card").totalPaidAmount, 15000);

  const overview = await ctx.call("GET", "/reports/overview?period=today", { token: tokens.manager });
  assert.equal(overview.data.total.totalRevenue, 15000);
  const all = await ctx.call("GET", "/reports/overview?period=all", { token: tokens.manager });
  assert.equal(all.data.total.totalRevenue, 25000);

  // Reporter ham xuddi shu qoida bo'yicha: qarz yopilgan kun tushumi.
  const reporterToday = await ctx.call("GET", "/reporter/daily", { token: tokens.reporter });
  assert.equal(reporterToday.status, 200, JSON.stringify(reporterToday.body));
  assert.equal(reporterToday.data.cashier.procedure.paidAmount, 15000);
  assert.equal(reporterToday.data.cashier.procedure.count, 0);

  const weekAgoKey = new Date(daysAgo(7).getTime() + 5 * 3600000).toISOString().slice(0, 10);
  const reporterWeekAgo = await ctx.call("GET", `/reporter/daily?date=${weekAgoKey}`, { token: tokens.reporter });
  assert.equal(reporterWeekAgo.data.cashier.procedure.paidAmount, 10000);
  assert.equal(reporterWeekAgo.data.cashier.procedure.count, 1);
});

test("reporter oylik hisobot va Excel navbatsiz kunlarda ham ishlaydi", async () => {
  const monthly = await ctx.call("GET", "/reporter/monthly", { token: tokens.reporter });
  assert.equal(monthly.status, 200, JSON.stringify(monthly.body));
  assert.ok(monthly.data.rows.length >= 28);

  const res = await fetch(`${ctx.base}/reporter/monthly/export`, {
    headers: { Authorization: `Bearer ${tokens.reporter}` }
  });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /spreadsheetml/);
  assert.ok((await res.arrayBuffer()).byteLength > 1000);
});

test("reporter noto'g'ri oyni rad etadi", async () => {
  const res = await ctx.call("GET", "/reporter/monthly?month=2026-13", { token: tokens.reporter });
  assert.equal(res.status, 400);
});

// --- LOR navbat va TV -------------------------------------------------------

test("LOR: kassir raqam chiqaradi, LOR chaqiradi va chek yaratadi", async () => {
  const ticket = await ctx.call("POST", "/cashier/lor-queue-tickets", {
    token: tokens.cashier,
    body: { idempotencyKey: "t1" }
  });
  assert.equal(ticket.status, 201, JSON.stringify(ticket.body));
  assert.equal(ticket.data.queueCode, "01");
  const repeat = await ctx.call("POST", "/cashier/lor-queue-tickets", {
    token: tokens.cashier,
    body: { idempotencyKey: "t1" }
  });
  assert.equal(repeat.data.id, ticket.data.id);

  const called = await ctx.call("POST", `/usage/lor-queue-tickets/${ticket.data.id}/call`, {
    token: tokens.lor,
    body: { lorIdentity: "lor1", specialistId: fixtures.lorDoctor._id, specialistName: "Dr. Karimov" }
  });
  assert.equal(called.status, 200, JSON.stringify(called.body));

  const tv = await ctx.call("GET", "/tv/lor-queue?lorIdentity=lor1", { token: tokens.tv });
  assert.equal(tv.data.current.queueCode, "01");
  assert.match(tv.data.date, /^\d{4}-\d{2}-\d{2}$/);

  const checkout = await ctx.call("POST", "/usage/lor-checkout", {
    token: tokens.lor,
    body: {
      services: [{ serviceId: fixtures.lorService._id, quantity: 1 }],
      patient: { firstName: "Olim", lastName: "Sobirov" },
      lorIdentity: "lor1",
      specialistId: fixtures.lorDoctor._id,
      queueTicketId: ticket.data.id
    }
  });
  assert.equal(checkout.status, 201, JSON.stringify(checkout.body));
  assert.equal(checkout.data.check.lorQueue.queueCode, "01");
});

test("LOR: oldingi smenadan qolgan qabul yangi smenada yakunlanadi", async () => {
  const LorQueueTicket = require("../models/LorQueueTicket");
  const { shiftDateString } = require("../services/cashierSettingsService");
  const ticket = await ctx.call("POST", "/cashier/lor-queue-tickets", {
    token: tokens.cashier,
    body: { idempotencyKey: "t2" }
  });
  await ctx.call("POST", `/usage/lor-queue-tickets/${ticket.data.id}/call`, {
    token: tokens.lor,
    body: { lorIdentity: "lor1", specialistId: fixtures.lorDoctor._id, specialistName: "Dr. Karimov" }
  });
  await LorQueueTicket.collection.updateOne(
    { _id: new mongoose.Types.ObjectId(ticket.data.id) },
    { $set: { shiftDate: shiftDateString(ticket.data.shiftDate, -1) } }
  );

  const list = await ctx.call("GET", "/usage/lor-queue-tickets?lorIdentity=lor1", { token: tokens.lor });
  assert.equal(list.data.current?.id, ticket.data.id);

  const checkout = await ctx.call("POST", "/usage/lor-checkout", {
    token: tokens.lor,
    body: {
      services: [{ serviceId: fixtures.lorService._id, quantity: 1 }],
      patient: { firstName: "Bek", lastName: "Aliyev" },
      lorIdentity: "lor1",
      specialistId: fixtures.lorDoctor._id,
      queueTicketId: ticket.data.id
    }
  });
  assert.equal(checkout.status, 201, JSON.stringify(checkout.body));
});

test("LOR: bepul (0 so'm) xizmat, 0 so'mlik chek kassada qarzsiz qabul qilinadi", async () => {
  const free = await ctx.call("POST", "/services", {
    token: tokens.lor,
    body: { name: "Qayta ko'rik", type: "lor", price: 0 }
  });
  assert.equal(free.status, 201, JSON.stringify(free.body));
  assert.equal(free.data.price, 0);

  const negative = await ctx.call("POST", "/services", {
    token: tokens.lor,
    body: { name: "Xato", type: "lor", price: -1 }
  });
  assert.equal(negative.status, 400);

  const nurseFree = await ctx.call("POST", "/services", {
    token: tokens.nurse,
    body: { name: "Bepul ukol", type: "nurse", priceOptions: { first: 0, second: 0, third: 0 } }
  });
  assert.equal(nurseFree.status, 400);

  const ticket = await ctx.call("POST", "/cashier/lor-queue-tickets", {
    token: tokens.cashier,
    body: { idempotencyKey: "t-free" }
  });
  await ctx.call("POST", `/usage/lor-queue-tickets/${ticket.data.id}/call`, {
    token: tokens.lor,
    body: { lorIdentity: "lor1", specialistId: fixtures.lorDoctor._id, specialistName: "Dr. Karimov" }
  });
  const checkout = await ctx.call("POST", "/usage/lor-checkout", {
    token: tokens.lor,
    body: {
      services: [{ serviceId: free.data._id, quantity: 1 }],
      patient: { firstName: "Bepul", lastName: "Bemor" },
      lorIdentity: "lor1",
      specialistId: fixtures.lorDoctor._id,
      queueTicketId: ticket.data.id
    }
  });
  assert.equal(checkout.status, 201, JSON.stringify(checkout.body));
  assert.equal(checkout.data.check.total, 0);

  const accepted = await ctx.call("POST", "/cashier/entries", {
    token: tokens.cashier,
    body: { checkRef: checkout.data.check._id, paidAmount: 0, paymentMethod: "cash" }
  });
  assert.equal(accepted.status, 201, JSON.stringify(accepted.body));
  assert.equal(accepted.data.amount, 0);
  assert.equal(accepted.data.debtAmount, 0);
});

test("TV SSE: uzilgan ulanishlar tinglovchi qoldirmaydi", async () => {
  const streamToken = (await ctx.call("GET", "/tv/lor-queue/stream-token", { token: tokens.tv })).data.token;
  const url = `${ctx.base}/tv/lor-queue/stream?lorIdentity=lor1&streamToken=${streamToken}`;
  const controllers = [];

  for (let i = 0; i < 5; i += 1) {
    const controller = new AbortController();
    const res = await fetch(url, { signal: controller.signal });
    assert.equal(res.status, 200);
    const { value } = await res.body.getReader().read();
    assert.ok(new TextDecoder().decode(value).includes("retry"));
    controllers.push(controller);
  }

  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(queueEmitter.listenerCount("lor-queue:changed"), 5);
  controllers.forEach((controller) => controller.abort());
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.equal(queueEmitter.listenerCount("lor-queue:changed"), 0);
});
