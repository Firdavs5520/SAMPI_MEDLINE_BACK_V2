const mongoose = require("mongoose");
const LorQueueCounter = require("../models/LorQueueCounter");
const LorQueueTicket = require("../models/LorQueueTicket");
const cashierSettingsService = require("./cashierSettingsService");
const { emitLorQueueChanged } = require("./lorQueueEvents");
const AppError = require("../utils/AppError");

const TASHKENT_UTC_OFFSET_HOURS = 5;
const LOR_IDENTITIES = ["lor1"];
const TICKET_LIMIT = 80;
const IDEMPOTENCY_KEY_MAX_LENGTH = 120;
const CANCEL_REASONS = new Set([
  "patient_absent",
  "wrong_direction",
  "patient_left",
  "other"
]);

const toTashkentDateString = (date = new Date()) =>
  new Date(date.getTime() + TASHKENT_UTC_OFFSET_HOURS * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

const normalizeDateString = (value) => {
  const safe = String(value || "").trim();
  if (!safe) return toTashkentDateString(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(safe)) {
    throw new AppError("Sana YYYY-MM-DD formatida bo'lishi kerak", 400);
  }
  return safe;
};

const parseDateParts = (dateString) => {
  const [yearPart, monthPart, dayPart] = String(dateString).split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new AppError("Sana noto'g'ri", 400);
  }

  return { year, month, day };
};

const getTodayShiftRange = async (date) => {
  const safeDateString = normalizeDateString(date);
  const shift = await cashierSettingsService.getShiftRange({
    dateString: safeDateString,
    dateParts: parseDateParts(safeDateString)
  });

  return { safeDateString, shift };
};

const normalizeLorIdentity = (value) => {
  const safe = String(value || "lor1").trim().toLowerCase();
  if (!LOR_IDENTITIES.includes(safe)) {
    throw new AppError("Navbat faqat faol LOR uchun ishlaydi", 400);
  }
  return safe;
};

const normalizeLimit = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return TICKET_LIMIT;
  return Math.min(TICKET_LIMIT, Math.max(1, Math.floor(parsed)));
};

const normalizeIdempotencyKey = (value) => {
  const safe = String(value || "").trim();
  if (!safe) return "";

  if (safe.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
    throw new AppError(
      `Idempotency key uzunligi ${IDEMPOTENCY_KEY_MAX_LENGTH} belgidan oshmasligi kerak`,
      400
    );
  }

  return safe;
};

const normalizePatient = (patient) => {
  const firstName = String(patient?.firstName || "").trim();
  const lastName = String(patient?.lastName || "").trim();

  if (!firstName || !lastName) {
    throw new AppError("Bemorning ismi va familiyasi majburiy", 400);
  }

  return {
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`.trim()
  };
};

const normalizeCancelReason = (value) => {
  const safe = String(value || "").trim().toLowerCase();
  if (!safe) {
    throw new AppError("Bekor qilish sababini tanlang", 400);
  }
  if (!CANCEL_REASONS.has(safe)) {
    throw new AppError("Bekor qilish sababi noto'g'ri", 400);
  }
  return safe;
};

const normalizeCancelNote = (value) => String(value || "").trim().slice(0, 200);

const assertObjectId = (value, label) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new AppError(`${label} noto'g'ri`, 400);
  }
};

const normalizeDoctorName = (value) => {
  const safe = String(value || "").trim();
  if (!safe) {
    throw new AppError("Doktor nomi majburiy", 400);
  }
  return safe;
};

const assertCashierUser = (user) => {
  if (!user || user.role !== "cashier") {
    throw new AppError("LOR navbat raqamini faqat kassir chiqaradi", 403);
  }
};

const assertLorUser = (user) => {
  if (!user || user.role !== "lor") {
    throw new AppError("Bu amal faqat LOR uchun", 403);
  }
};

const formatQueueCode = (value) => String(Number(value || 0)).padStart(2, "0");

const toIso = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
};

const getMinutesSince = (value, now = new Date()) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 0;
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60000));
};

const serializeTicket = (ticket, { includePrivate = true, now = new Date() } = {}) => {
  if (!ticket) return null;
  const row = typeof ticket.toObject === "function" ? ticket.toObject() : ticket;
  const calledAt = row.calledAt || null;
  const createdAt = row.createdAt || null;
  const base = {
    _id: String(row._id),
    id: String(row._id),
    queueCode: formatQueueCode(row.queueCode),
    lorIdentity: row.lorIdentity,
    status: row.status,
    shiftDate: row.shiftDate,
    createdAt: toIso(createdAt),
    calledAt: toIso(calledAt),
    completedAt: toIso(row.completedAt),
    cancelledAt: toIso(row.cancelledAt),
    cancelReason: row.cancelReason || "",
    cancelNote: row.cancelNote || "",
    minutesSinceCreated: getMinutesSince(createdAt, now),
    minutesSinceCalled: getMinutesSince(calledAt, now),
    checkRef: row.checkRef ? String(row.checkRef) : "",
    checkCode: row.checkCode || ""
  };

  if (!includePrivate) {
    return {
      id: base.id,
      queueCode: base.queueCode,
      calledAt: base.calledAt,
      createdAt: base.createdAt,
      minutesSinceCalled: base.minutesSinceCalled
    };
  }

  return {
    ...base,
    patient: {
      firstName: row.patient?.firstName || "",
      lastName: row.patient?.lastName || "",
      fullName: row.patient?.fullName || ""
    },
    doctor: {
      specialistId: row.doctor?.specialistId ? String(row.doctor.specialistId) : "",
      name: row.doctor?.name || ""
    }
  };
};

const buildCounterKey = ({ shiftDate, lorIdentity }) => `${shiftDate}:${lorIdentity}`;

const getHighestQueueTicket = async ({ shiftDate, lorIdentity }) => {
  const [ticket] = await LorQueueTicket.aggregate([
    {
      $match: {
        shiftDate,
        lorIdentity
      }
    },
    {
      $addFields: {
        queueNumber: {
          $convert: {
            input: "$queueCode",
            to: "int",
            onError: 0,
            onNull: 0
          }
        }
      }
    },
    { $sort: { queueNumber: -1, createdAt: -1, _id: -1 } },
    { $limit: 1 }
  ]);

  return ticket || null;
};

const getHighestQueueNumber = async ({ shiftDate, lorIdentity }) => {
  const highestTicket = await getHighestQueueTicket({ shiftDate, lorIdentity });
  return Math.max(0, Number(highestTicket?.queueNumber || 0));
};

const isDuplicateKeyError = (error) => error?.code === 11000;

const getLatestQueueTickets = async ({ shiftDate, lorIdentity, limit = 5 }) => {
  const safeLimit = Math.min(20, Math.max(1, Math.floor(Number(limit) || 5)));
  return LorQueueTicket.aggregate([
    {
      $match: {
        shiftDate,
        lorIdentity
      }
    },
    {
      $addFields: {
        queueNumber: {
          $convert: {
            input: "$queueCode",
            to: "int",
            onError: 0,
            onNull: 0
          }
        }
      }
    },
    { $sort: { queueNumber: -1, createdAt: -1, _id: -1 } },
    { $limit: safeLimit }
  ]);
};

const notifyQueueChanged = ({
  shiftDate,
  lorIdentity = "lor1",
  action = "changed",
  ticket
} = {}) => {
  emitLorQueueChanged({
    shiftDate,
    lorIdentity,
    action,
    ticketId: ticket?._id ? String(ticket._id) : ticket?.id || "",
    queueCode: ticket?.queueCode || ""
  });
};

const syncCounterToIssuedQueue = async ({ shiftDate, lorIdentity, queueNumber }) => {
  const key = buildCounterKey({ shiftDate, lorIdentity });
  await LorQueueCounter.findOneAndUpdate(
    { key },
    {
      $max: {
        sequence: queueNumber
      },
      $set: {
        shiftDate,
        lorIdentity
      }
    },
    {
      upsert: true,
      setDefaultsOnInsert: true
    }
  );
};

const reserveNextQueueNumber = async ({ shiftDate, lorIdentity }) => {
  const key = buildCounterKey({ shiftDate, lorIdentity });
  const highestQueueNumber = await getHighestQueueNumber({ shiftDate, lorIdentity });

  try {
    await syncCounterToIssuedQueue({
      shiftDate,
      lorIdentity,
      queueNumber: highestQueueNumber
    });
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }
  }

  const counter = await LorQueueCounter.findOneAndUpdate(
    { key },
    {
      $inc: {
        sequence: 1
      },
      $set: {
        shiftDate,
        lorIdentity
      }
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true
    }
  ).lean();

  return Number(counter?.sequence || highestQueueNumber + 1);
};

const issueTicket = async ({ user, lorIdentity = "lor1", idempotencyKey } = {}) => {
  assertCashierUser(user);
  const normalizedLorIdentity = normalizeLorIdentity(lorIdentity);
  const safeIdempotencyKey = normalizeIdempotencyKey(idempotencyKey);
  const { safeDateString } = await getTodayShiftRange();

  if (safeIdempotencyKey) {
    const existing = await LorQueueTicket.findOne({
      shiftDate: safeDateString,
      lorIdentity: normalizedLorIdentity,
      "createdBy.userId": user._id,
      idempotencyKey: safeIdempotencyKey
    }).lean();

    if (existing) {
      return serializeTicket(existing);
    }
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const queueNumber = await reserveNextQueueNumber({
      shiftDate: safeDateString,
      lorIdentity: normalizedLorIdentity
    });
    const queueCode = formatQueueCode(queueNumber);

    try {
      const ticket = await LorQueueTicket.create({
        queueCode,
        shiftDate: safeDateString,
        lorIdentity: normalizedLorIdentity,
        ...(safeIdempotencyKey ? { idempotencyKey: safeIdempotencyKey } : {}),
        createdBy: {
          userId: user._id,
          role: user.role,
          name: user.name
        }
      });

      await syncCounterToIssuedQueue({
        shiftDate: safeDateString,
        lorIdentity: normalizedLorIdentity,
        queueNumber
      });

      notifyQueueChanged({
        shiftDate: safeDateString,
        lorIdentity: normalizedLorIdentity,
        action: "issued",
        ticket
      });

      return serializeTicket(ticket);
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }

      if (safeIdempotencyKey) {
        const existing = await LorQueueTicket.findOne({
          shiftDate: safeDateString,
          lorIdentity: normalizedLorIdentity,
          "createdBy.userId": user._id,
          idempotencyKey: safeIdempotencyKey
        }).lean();

        if (existing) {
          return serializeTicket(existing);
        }
      }
    }
  }

  throw new AppError("LOR navbat raqamini yaratib bo'lmadi", 500);
};

const getIssueStatus = async ({ user, lorIdentity = "lor1" } = {}) => {
  assertCashierUser(user);
  const normalizedLorIdentity = normalizeLorIdentity(lorIdentity);
  const { safeDateString, shift } = await getTodayShiftRange();
  const [lastIssued, issuedCount, recentIssued] = await Promise.all([
    getHighestQueueTicket({
      shiftDate: safeDateString,
      lorIdentity: normalizedLorIdentity
    }),
    LorQueueTicket.countDocuments({
      shiftDate: safeDateString,
      lorIdentity: normalizedLorIdentity
    }),
    getLatestQueueTickets({
      shiftDate: safeDateString,
      lorIdentity: normalizedLorIdentity,
      limit: 5
    })
  ]);
  const sequence = Number(lastIssued?.queueNumber || 0);

  return {
    date: safeDateString,
    lorIdentity: normalizedLorIdentity,
    nextQueueCode: formatQueueCode(sequence + 1),
    issuedCount: Number(issuedCount || 0),
    lastIssued: serializeTicket(lastIssued),
    recentIssued: recentIssued.map((ticket) => serializeTicket(ticket)),
    shift: {
      start: shift.start.toISOString(),
      end: shift.end.toISOString(),
      fromLabel: shift.fromLabel,
      toLabel: shift.toLabel
    }
  };
};

const getLorTickets = async ({ user, lorIdentity = "lor1", limit = TICKET_LIMIT } = {}) => {
  assertLorUser(user);
  const normalizedLorIdentity = normalizeLorIdentity(lorIdentity);
  const safeLimit = normalizeLimit(limit);
  const { safeDateString, shift } = await getTodayShiftRange();
  const now = new Date();

  const [current, waiting] = await Promise.all([
    LorQueueTicket.findOne({
      shiftDate: safeDateString,
      lorIdentity: normalizedLorIdentity,
      status: "in_progress"
    })
      .sort({ calledAt: -1, updatedAt: -1 })
      .lean(),
    LorQueueTicket.find({
      shiftDate: safeDateString,
      lorIdentity: normalizedLorIdentity,
      status: "waiting"
    })
      .sort({ createdAt: 1 })
      .limit(safeLimit)
      .lean()
  ]);

  return {
    date: safeDateString,
    generatedAt: now.toISOString(),
    shift: {
      start: shift.start.toISOString(),
      end: shift.end.toISOString(),
      fromLabel: shift.fromLabel,
      toLabel: shift.toLabel
    },
    current: serializeTicket(current, { now }),
    waiting: waiting.map((ticket) => serializeTicket(ticket, { now }))
  };
};

const callTicket = async ({
  user,
  ticketId,
  lorIdentity = "lor1",
  specialistId,
  specialistName
} = {}) => {
  assertLorUser(user);
  assertObjectId(ticketId, "Navbat ID");
  const normalizedLorIdentity = normalizeLorIdentity(lorIdentity);
  const doctorName = normalizeDoctorName(specialistName);
  const { safeDateString } = await getTodayShiftRange();

  const existingCurrent = await LorQueueTicket.findOne({
    shiftDate: safeDateString,
    lorIdentity: normalizedLorIdentity,
    status: "in_progress"
  });

  if (existingCurrent) {
    if (String(existingCurrent._id) === String(ticketId)) {
      return serializeTicket(existingCurrent);
    }

    throw new AppError(
      `Avval ${formatQueueCode(existingCurrent.queueCode)} raqamli bemorni yakunlang`,
      400
    );
  }

  try {
    const ticket = await LorQueueTicket.findOneAndUpdate(
      {
        _id: ticketId,
        shiftDate: safeDateString,
        lorIdentity: normalizedLorIdentity,
        status: "waiting"
      },
      {
        $set: {
          status: "in_progress",
          doctor: {
            ...(specialistId ? { specialistId } : {}),
            name: doctorName
          },
          calledBy: {
            userId: user._id,
            role: user.role,
            name: user.name
          },
          calledAt: new Date(),
          cancelledAt: null,
          completedAt: null
        }
      },
      { new: true }
    );

    if (!ticket) {
      throw new AppError("Kutilayotgan LOR navbat raqami topilmadi", 404);
    }

    notifyQueueChanged({
      shiftDate: safeDateString,
      lorIdentity: normalizedLorIdentity,
      action: "called",
      ticket
    });

    return serializeTicket(ticket);
  } catch (error) {
    if (error?.code === 11000) {
      throw new AppError("Avval hozirgi LOR bemorni yakunlang", 400);
    }
    throw error;
  }
};

const cancelTicket = async ({
  user,
  ticketId,
  lorIdentity = "lor1",
  reason,
  note
} = {}) => {
  assertLorUser(user);
  assertObjectId(ticketId, "Navbat ID");
  const normalizedLorIdentity = normalizeLorIdentity(lorIdentity);
  const { safeDateString } = await getTodayShiftRange();

  const ticket = await LorQueueTicket.findOne({
    _id: ticketId,
    shiftDate: safeDateString,
    lorIdentity: normalizedLorIdentity
  });

  if (!ticket) {
    throw new AppError("LOR navbat raqami topilmadi", 404);
  }

  if (ticket.status === "completed") {
    throw new AppError("Cheki yaratilgan navbatni bekor qilib bo'lmaydi", 400);
  }

  if (ticket.status === "cancelled") {
    return serializeTicket(ticket);
  }

  const safeReason = normalizeCancelReason(reason);
  const safeNote = normalizeCancelNote(note);

  ticket.status = "cancelled";
  ticket.cancelReason = safeReason;
  ticket.cancelNote = safeNote;
  ticket.cancelledBy = {
    userId: user._id,
    role: user.role,
    name: user.name
  };
  ticket.cancelledAt = new Date();
  ticket.completedAt = null;
  await ticket.save();

  notifyQueueChanged({
    shiftDate: safeDateString,
    lorIdentity: normalizedLorIdentity,
    action: "cancelled",
    ticket
  });

  return serializeTicket(ticket);
};

const getActiveTicketForCheckout = async ({
  ticketId,
  user,
  lorIdentity = "lor1",
  specialistId,
  session
} = {}) => {
  assertLorUser(user);
  assertObjectId(ticketId, "Navbat ID");
  const normalizedLorIdentity = normalizeLorIdentity(lorIdentity);
  const { safeDateString } = await getTodayShiftRange();
  const query = LorQueueTicket.findOne({
    _id: ticketId,
    shiftDate: safeDateString,
    lorIdentity: normalizedLorIdentity,
    status: "in_progress"
  });

  if (session) {
    query.session(session);
  }

  const ticket = await query;
  if (!ticket) {
    throw new AppError("Avval kassir chiqargan LOR raqamni qabul qiling", 400);
  }

  const ticketDoctorId = ticket.doctor?.specialistId ? String(ticket.doctor.specialistId) : "";
  const safeSpecialistId = String(specialistId || "").trim();
  if (ticketDoctorId && safeSpecialistId && ticketDoctorId !== safeSpecialistId) {
    throw new AppError("Bu navbat boshqa doktor tomonidan qabul qilingan", 400);
  }

  return ticket;
};

const completeTicketWithCheck = async ({
  ticketId,
  user,
  patient,
  check,
  session
} = {}) => {
  assertLorUser(user);
  assertObjectId(ticketId, "Navbat ID");
  const normalizedPatient = normalizePatient(patient);

  const updateQuery = LorQueueTicket.findOneAndUpdate(
    {
      _id: ticketId,
      status: "in_progress",
      checkRef: null
    },
    {
      $set: {
        status: "completed",
        patient: normalizedPatient,
        checkRef: check._id,
        checkCode: String(check.checkId || "").trim(),
        completedAt: new Date()
      }
    },
    { new: true }
  );

  if (session) {
    updateQuery.session(session);
  }

  const ticket = await updateQuery;
  if (!ticket) {
    throw new AppError("LOR navbatini chek bilan yakunlab bo'lmadi", 400);
  }

  return ticket;
};

const getCurrentTicketForTv = async ({ date, lorIdentity = "lor1", limit = 16 } = {}) => {
  const { safeDateString, shift } = await getTodayShiftRange(date);
  const normalizedLorIdentity = normalizeLorIdentity(lorIdentity);
  const safeLimit = normalizeLimit(limit);
  const now = new Date();
  const [current, waiting] = await Promise.all([
    LorQueueTicket.findOne({
      shiftDate: safeDateString,
      lorIdentity: normalizedLorIdentity,
      status: "in_progress"
    })
      .sort({ calledAt: -1, updatedAt: -1 })
      .lean(),
    LorQueueTicket.find({
      shiftDate: safeDateString,
      lorIdentity: normalizedLorIdentity,
      status: "waiting"
    })
      .sort({ createdAt: 1 })
      .limit(safeLimit)
      .lean()
  ]);

  return {
    date: safeDateString,
    shift,
    now,
    current: serializeTicket(current, {
      includePrivate: false,
      now
    }),
    waiting: waiting.map((ticket) =>
      serializeTicket(ticket, {
        includePrivate: false,
        now
      })
    )
  };
};

module.exports = {
  issueTicket,
  getIssueStatus,
  getLorTickets,
  callTicket,
  cancelTicket,
  getActiveTicketForCheckout,
  completeTicketWithCheck,
  getCurrentTicketForTv,
  notifyQueueChanged,
  normalizeLorIdentity,
  serializeTicket
};
