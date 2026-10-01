const mongoose = require("mongoose");

const MAX_ATTEMPTS = 6;

const hasErrorLabel = (error, label) =>
  Boolean(error?.hasErrorLabel?.(label) || error?.errorLabelSet?.has?.(label));

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const abortQuietly = async (session) => {
  try {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
  } catch (_) {
    // Asl xatoni saqlab qolish uchun abort xatosini e'tiborsiz qoldiramiz.
  }
};

const commitWithRetry = async (session) => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await session.commitTransaction();
      return;
    } catch (error) {
      if (attempt < MAX_ATTEMPTS && hasErrorLabel(error, "UnknownTransactionCommitResult")) {
        continue;
      }
      throw error;
    }
  }
};

// Tranzaksiyani bajaradi va MongoDB "TransientTransactionError" (masalan, ikki
// hamshira bir vaqtda bitta dorini ishlatganda WriteConflict) qaytarsa, butun
// ishni qisqa kutishdan keyin qayta bajaradi. `work` qayta chaqirilishi mumkin,
// shuning uchun u faqat session ichidagi DB amallarini bajarishi kerak.
const runInTransaction = async (work) => {
  for (let attempt = 1; ; attempt += 1) {
    const session = await mongoose.startSession();

    try {
      session.startTransaction();
      const result = await work(session);
      await commitWithRetry(session);
      return result;
    } catch (error) {
      await abortQuietly(session);

      if (attempt < MAX_ATTEMPTS && hasErrorLabel(error, "TransientTransactionError")) {
        await wait(20 * attempt + Math.floor(Math.random() * 40));
        continue;
      }

      throw error;
    } finally {
      await session.endSession();
    }
  }
};

module.exports = runInTransaction;
