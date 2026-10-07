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

test("LOR navbat: hisoblagich yo'qolsa ham raqam takrorlanmaydi, ketma-ket davom etadi", async () => {
  const issue = (key) =>
    ctx.call("POST", "/cashier/lor-queue-tickets", { token: tokens.cashier, body: { idempotencyKey: key } });
  const first = await issue("cnt-1");
  assert.equal(first.status, 201, JSON.stringify(first.body));
  const firstNumber = Number(first.data.queueCode);

  await mongoose.connection.collection("lorqueuecounters").deleteMany({});
  const afterReset = await issue("cnt-2");
  assert.equal(afterReset.status, 201, JSON.stringify(afterReset.body));
  assert.equal(Number(afterReset.data.queueCode), firstNumber + 1);

  const next = await issue("cnt-3");
  assert.equal(Number(next.data.queueCode), firstNumber + 2);
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

const createLorCheck = async (key, services = [{ serviceId: fixtures.lorService._id, quantity: 1 }]) => {
  const ticket = await ctx.call("POST", "/cashier/lor-queue-tickets", {
    token: tokens.cashier,
    body: { idempotencyKey: key }
  });
  await ctx.call("POST", `/usage/lor-queue-tickets/${ticket.data.id}/call`, {
    token: tokens.lor,
    body: { lorIdentity: "lor1", specialistId: fixtures.lorDoctor._id, specialistName: "Dr. Karimov" }
  });
  const checkout = await ctx.call("POST", "/usage/lor-checkout", {
    token: tokens.lor,
    body: {
      services,
      patient: { firstName: "Tahrir", lastName: key },
      lorIdentity: "lor1",
      specialistId: fixtures.lorDoctor._id,
      queueTicketId: ticket.data.id
    }
  });
  assert.equal(checkout.status, 201, JSON.stringify(checkout.body));
  return checkout.data.check;
};

test("kassa 1 mln so'mdan katta chekni qabul qiladi", async () => {
  const pricey = await ctx.call("POST", "/services", {
    token: tokens.lor,
    body: { name: "Operatsiya", type: "lor", price: 900000 }
  });
  assert.equal(pricey.status, 201, JSON.stringify(pricey.body));
  const check = await createLorCheck("t-big", [{ serviceId: pricey.data._id, quantity: 2 }]);
  assert.equal(check.total, 1800000);

  const accepted = await ctx.call("POST", "/cashier/entries", {
    token: tokens.cashier,
    body: { checkRef: check._id, paidAmount: 1500000, paymentMethod: "card", patientPhone: "+998901112233" }
  });
  assert.equal(accepted.status, 201, JSON.stringify(accepted.body));
  assert.equal(accepted.data.amount, 1800000);
  assert.equal(accepted.data.paidAmount, 1500000);
  assert.equal(accepted.data.debtAmount, 300000);
});

test("LOR chekni 12 soat ichida tahrirlaydi, tarix saqlanadi", async () => {
  const extra = (
    await ctx.call("POST", "/services", { token: tokens.lor, body: { name: "Yuvish", type: "lor", price: 30000 } })
  ).data;
  const check = await createLorCheck("edit-1");
  assert.equal(check.total, 100000);
  assert.equal(String(check.items[0].serviceId), String(fixtures.lorService._id));

  const edited = await ctx.call("PATCH", `/usage/lor-checks/${check._id}`, {
    token: tokens.lor,
    body: {
      services: [
        { serviceId: fixtures.lorService._id, quantity: 1 },
        { serviceId: extra._id, quantity: 2 }
      ]
    }
  });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  assert.equal(edited.data.total, 160000);
  assert.equal(edited.data.items.length, 2);
  assert.equal(edited.data.editHistory.length, 1);
  assert.equal(edited.data.editHistory[0].previousTotal, 100000);
  assert.equal(edited.data.checkId, check.checkId);
  assert.equal(edited.data.patient.fullName, check.patient.fullName);

  const nurse = await ctx.call("PATCH", `/usage/lor-checks/${check._id}`, {
    token: tokens.nurse,
    body: { services: [{ serviceId: fixtures.lorService._id, quantity: 1 }] }
  });
  assert.equal(nurse.status, 403);

  const empty = await ctx.call("PATCH", `/usage/lor-checks/${check._id}`, {
    token: tokens.lor,
    body: { services: [] }
  });
  assert.equal(empty.status, 400);
});

test("LOR chek tahriri kassadagi summa va qarzni yangilaydi", async () => {
  const check = await createLorCheck("edit-2");
  const accepted = await ctx.call("POST", "/cashier/entries", {
    token: tokens.cashier,
    body: { checkRef: check._id, paidAmount: 100000, paymentMethod: "cash" }
  });
  assert.equal(accepted.status, 201, JSON.stringify(accepted.body));

  const more = await ctx.call("PATCH", `/usage/lor-checks/${check._id}`, {
    token: tokens.lor,
    body: { services: [{ serviceId: fixtures.lorService._id, quantity: 2 }] }
  });
  assert.equal(more.status, 200, JSON.stringify(more.body));

  const CashierEntry = require("../models/CashierEntry");
  const entry = await CashierEntry.findById(accepted.data._id).lean();
  assert.equal(entry.amount, 200000);
  assert.equal(entry.paidAmount, 100000);
  assert.equal(entry.debtAmount, 100000);

  // To'langan summadan kamaytirib bo'lmaydi.
  const free = (
    await ctx.call("POST", "/services", { token: tokens.lor, body: { name: "Maslahat", type: "lor", price: 0 } })
  ).data;
  const less = await ctx.call("PATCH", `/usage/lor-checks/${check._id}`, {
    token: tokens.lor,
    body: { services: [{ serviceId: free._id, quantity: 1 }] }
  });
  assert.equal(less.status, 400);
  const unchanged = await CashierEntry.findById(accepted.data._id).lean();
  assert.equal(unchanged.amount, 200000);
});

test("LOR chekini 12 soatdan keyin tahrirlab bo'lmaydi", async () => {
  const Check = require("../models/Check");
  const check = await createLorCheck("edit-3");
  await Check.collection.updateOne(
    { _id: new mongoose.Types.ObjectId(check._id) },
    { $set: { createdAt: new Date(Date.now() - 13 * 3600000) } }
  );
  const late = await ctx.call("PATCH", `/usage/lor-checks/${check._id}`, {
    token: tokens.lor,
    body: { services: [{ serviceId: fixtures.lorService._id, quantity: 2 }] }
  });
  assert.equal(late.status, 400);
  assert.match(late.body.message, /12 soat/);
  const stored = await Check.findById(check._id).lean();
  assert.equal(stored.total, 100000);
});

test("kassa: kutilmagan xarajat qo'shiladi, jami hisoblanadi va bekor qilinadi", async () => {
  const bad = await ctx.call("POST", "/cashier/expenses", {
    token: tokens.cashier,
    body: { amount: 0, reason: "Xato" }
  });
  assert.equal(bad.status, 400);
  const noReason = await ctx.call("POST", "/cashier/expenses", {
    token: tokens.cashier,
    body: { amount: 5000, reason: "  " }
  });
  assert.equal(noReason.status, 400);
  const byLor = await ctx.call("POST", "/cashier/expenses", {
    token: tokens.lor,
    body: { amount: 5000, reason: "Xato" }
  });
  assert.equal(byLor.status, 403);

  const first = await ctx.call("POST", "/cashier/expenses", {
    token: tokens.cashier,
    body: { amount: 25000, reason: "Suv va stakan", paymentMethod: "cash" }
  });
  assert.equal(first.status, 201, JSON.stringify(first.body));
  const second = await ctx.call("POST", "/cashier/expenses", {
    token: tokens.cashier,
    body: { amount: 40000, reason: "Kur'er", paymentMethod: "card" }
  });
  assert.equal(second.status, 201);

  const list = await ctx.call("GET", "/cashier/expenses", { token: tokens.manager });
  assert.equal(list.status, 200);
  assert.equal(list.data.expenses.length, 2);
  assert.equal(list.data.totals.total, 65000);
  assert.equal(list.data.totals.cash, 25000);
  assert.equal(list.data.totals.card, 40000);

  const canceled = await ctx.call("POST", `/cashier/expenses/${second.data._id}/cancel`, {
    token: tokens.cashier
  });
  assert.equal(canceled.status, 200);
  const again = await ctx.call("POST", `/cashier/expenses/${second.data._id}/cancel`, {
    token: tokens.cashier
  });
  assert.equal(again.status, 400);

  const after = await ctx.call("GET", "/cashier/expenses", { token: tokens.cashier });
  assert.equal(after.data.totals.total, 25000);
  assert.equal(after.data.totals.count, 1);
  assert.equal(after.data.expenses.length, 2);

  const otherDay = await ctx.call("GET", "/cashier/expenses?date=2020-01-01", { token: tokens.cashier });
  assert.equal(otherDay.data.expenses.length, 0);
});

test("kassa: hisobchi hisoboti doktor ulushi, protsedura, qarz va xarajatni hisoblaydi", async () => {
  const CashierEntry = require("../models/CashierEntry");
  const User = require("../models/User");
  const cashier = await User.findOne({ role: "cashier" }).lean();
  await CashierEntry.create({
    department: "lor",
    specialistType: "lor",
    specialistName: "Dr. Hisob",
    patientName: "Hisob Bemor",
    amount: 100000,
    paidAmount: 60000,
    debtAmount: 40000,
    paymentMethod: "cash",
    patientPhone: "+998901112233",
    // 2026-01-15 12:00 (Toshkent) — smena ichida, test soatiga bog'liq emas.
    entryDate: new Date("2026-01-15T07:00:00Z"),
    createdBy: { userId: cashier._id, role: "cashier", name: cashier.name }
  });

  const empty = await ctx.call("GET", "/cashier/accountant-report?date=2026-01-15", { token: tokens.cashier });
  assert.equal(empty.data.utilities.entered, false);
  assert.equal(empty.data.utilities.total, 0);

  // Svet/gaz/suvni hisobotchi kiritadi, hisobchi sahifasida ko'rinadi va sof summadan ayriladi.
  const utilities = await ctx.call("PUT", "/reporter/daily", {
    token: tokens.reporter,
    body: { date: "2026-01-15", electricityAmount: 12000, gasAmount: 8000, waterAmount: 5000 }
  });
  assert.equal(utilities.status, 200, JSON.stringify(utilities.body));

  const res = await ctx.call("GET", "/cashier/accountant-report?date=2026-01-15", { token: tokens.cashier });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const report = res.data;
  assert.equal(report.doctorSharePercent, 50);
  const doctor = report.doctors.find((row) => row.name === "Dr. Hisob");
  assert.deepEqual(
    [doctor.patients, doctor.billed, doctor.collected, doctor.doctorShare, doctor.clinicShare, doctor.debtLeft],
    [1, 100000, 60000, 30000, 30000, 40000]
  );
  assert.equal(report.lor.doctorShare, 30000);
  assert.equal(report.debts.newDebt, 40000);
  assert.ok(report.debts.outstandingTotal >= 40000);
  assert.equal(report.summary.cashInHand, 60000);
  assert.equal(report.utilities.entered, true);
  assert.deepEqual(
    report.utilities.items.map((item) => [item.label, item.amount]),
    [["Svet", 12000], ["Gaz", 8000], ["Suv", 5000]]
  );
  assert.equal(report.summary.utilities, 25000);
  assert.equal(
    report.summary.clinicNet,
    report.lor.clinicShare + report.procedures.collected - report.expenses.total - 25000
  );

  // Joriy smena: bekor qilingan xarajat hisobga kirmaydi.
  const current = (await ctx.call("GET", "/cashier/accountant-report", { token: tokens.cashier })).data;
  assert.equal(current.expenses.total, 25000);
  assert.equal(current.expenses.cash, 25000);
  assert.equal(
    current.summary.clinicNet,
    current.lor.clinicShare + current.procedures.collected - 25000 - current.summary.utilities
  );

  const methodsTotal = Object.values(report.byPaymentMethod).reduce((acc, value) => acc + value, 0);
  assert.equal(report.summary.totalCollected, methodsTotal);
  assert.equal(
    report.summary.clinicNet,
    report.lor.clinicShare + report.procedures.collected - report.expenses.total - report.summary.utilities
  );
  assert.equal(report.summary.cashInHand, report.byPaymentMethod.cash - report.expenses.cash);

  const manager = await ctx.call("GET", "/cashier/accountant-report?date=2020-01-01", { token: tokens.manager });
  assert.equal(manager.status, 200);
  assert.equal(manager.data.doctors.length, 0);
  assert.equal(manager.data.summary.totalCollected, 0);
  assert.equal((await ctx.call("GET", "/cashier/accountant-report", { token: tokens.lor })).status, 403);
  assert.equal(
    (await ctx.call("GET", "/cashier/accountant-report?date=bad", { token: tokens.cashier })).status,
    400
  );
});

test("reporter: bitta oy uchun to'liq Excel (hamma varaqlar bilan)", async () => {
  const ExcelJS = require("exceljs");
  const res = await fetch(`${ctx.base}/reporter/monthly/full-export`, {
    headers: { Authorization: `Bearer ${tokens.reporter}` }
  });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-disposition"), /sampi-oylik-\d{4}-\d{2}\.xlsx/);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await res.arrayBuffer()));
  assert.deepEqual(
    workbook.worksheets.map((sheet) => sheet.name),
    ["Umumiy", "Kunlik jadval", "Mutaxassislar", "Xizmatlar", "Dorilar", "Kassa xarajatlari", "Qarzdorlar", "Kassa yozuvlari"]
  );

  const summary = {};
  workbook.getWorksheet("Umumiy").eachRow((row) => {
    const label = row.getCell(1).value;
    if (label && !(label in summary)) summary[label] = row.getCell(2).value;
  });
  assert.ok(summary["Jami tushum"] > 0, JSON.stringify(summary));
  assert.equal(summary["Jami tushum"], summary["Naqd"] + summary["Karta"] + summary["O'tkazma"]);

  const entries = workbook.getWorksheet("Kassa yozuvlari");
  assert.ok(entries.rowCount >= 3, "kassa yozuvlari bo'lishi kerak");
  assert.equal(entries.getRow(entries.rowCount).getCell(1).value, "Jami");
  const services = [];
  workbook.getWorksheet("Xizmatlar").eachRow((row, number) => {
    if (number > 1) services.push(row.getCell(2).value);
  });
  assert.ok(services.length > 1, "xizmatlar ro'yxati bo'sh");

  const forbidden = await fetch(`${ctx.base}/reporter/monthly/full-export`, {
    headers: { Authorization: `Bearer ${tokens.cashier}` }
  });
  assert.equal(forbidden.status, 403);
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
