const mongoose = require("mongoose");
const CashierExpense = require("../models/CashierExpense");
const AppError = require("../utils/AppError");
const cashierSettingsService = require("./cashierSettingsService");

const PAYMENT_METHODS = ["cash", "card", "transfer"];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const assertCashier = (user) => {
  if (!user || user.role !== "cashier") {
    throw new AppError("Xarajatni faqat kassir kirita oladi", 403);
  }
};

const assertReader = (user) => {
  if (!user || !["cashier", "manager"].includes(user.role)) {
    throw new AppError("Ruxsat yo'q", 403);
  }
};

const toActor = (user) => ({
  userId: user._id,
  role: user.role,
  name: String(user.name || user.role)
});

const resolveDate = async (date) => {
  const safe = String(date || "").trim();
  if (!safe) return cashierSettingsService.getCurrentShiftDate();
  if (!DATE_PATTERN.test(safe)) {
    throw new AppError("Sana YYYY-MM-DD formatida bo'lishi kerak", 400);
  }
  return safe;
};

const createExpense = async ({ user, amount, reason, paymentMethod }) => {
  assertCashier(user);

  const safeAmount = Number(amount);
  if (!Number.isInteger(safeAmount) || safeAmount < 1 || safeAmount > 99999999) {
    throw new AppError("Summa 1 dan 99 999 999 gacha butun son bo'lishi kerak", 400);
  }

  const safeReason = String(reason || "").trim();
  if (!safeReason) {
    throw new AppError("Xarajat sababini yozing", 400);
  }
  if (safeReason.length > 300) {
    throw new AppError("Sabab 300 belgidan oshmasligi kerak", 400);
  }

  const safeMethod = paymentMethod ? String(paymentMethod) : "cash";
  if (!PAYMENT_METHODS.includes(safeMethod)) {
    throw new AppError("To'lov turi noto'g'ri", 400);
  }

  return CashierExpense.create({
    amount: safeAmount,
    reason: safeReason,
    paymentMethod: safeMethod,
    shiftDate: await cashierSettingsService.getCurrentShiftDate(),
    createdBy: toActor(user)
  });
};

const getExpenses = async ({ user, date }) => {
  assertReader(user);
  const shiftDate = await resolveDate(date);
  const expenses = await CashierExpense.find({ shiftDate }).sort({ createdAt: -1 }).lean();

  const totals = { total: 0, cash: 0, card: 0, transfer: 0, count: 0 };
  for (const expense of expenses) {
    if (expense.canceledAt) continue;
    totals.total += expense.amount;
    totals[expense.paymentMethod] = (totals[expense.paymentMethod] || 0) + expense.amount;
    totals.count += 1;
  }

  return { date: shiftDate, expenses, totals };
};

// Xato kiritilgan xarajatni faqat o'sha smena davomida bekor qilish mumkin (o'chirilmaydi).
const cancelExpense = async ({ user, expenseId }) => {
  assertCashier(user);
  if (!mongoose.Types.ObjectId.isValid(expenseId)) {
    throw new AppError("Xarajat ID noto'g'ri", 400);
  }

  const expense = await CashierExpense.findById(expenseId);
  if (!expense) {
    throw new AppError("Xarajat topilmadi", 404);
  }
  if (expense.canceledAt) {
    throw new AppError("Xarajat allaqachon bekor qilingan", 400);
  }

  const currentShiftDate = await cashierSettingsService.getCurrentShiftDate();
  if (expense.shiftDate !== currentShiftDate) {
    throw new AppError("Faqat joriy smenadagi xarajatni bekor qilish mumkin", 400);
  }

  expense.canceledAt = new Date();
  expense.canceledBy = toActor(user);
  await expense.save();
  return expense;
};

module.exports = { createExpense, getExpenses, cancelExpense };
