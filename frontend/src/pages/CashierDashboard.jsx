import { useEffect, useMemo, useState } from "react";
import Input from "../components/Input.jsx";
import Button from "../components/Button.jsx";
import Alert from "../components/Alert.jsx";
import Spinner from "../components/Spinner.jsx";
import Table from "../components/Table.jsx";
import ConfirmActionModal from "../components/ConfirmActionModal.jsx";
import cashierService from "../services/cashierService.js";
import { extractErrorMessage, formatCurrency } from "../utils/format.js";

const SECTION_META = {
  "nurse-patients": {
    title: "PROTSEDURA (Nurse)",
    subtitle: "Nurse protsedura yozuvlari va to'lov jurnali.",
    lockedType: "nurse",
    specialistLabel: "Medsestra"
  },
  "lor-patients": {
    title: "LOR bo'limi",
    subtitle: "LOR bemorlarini qo'shish va hisobini yuritish.",
    lockedType: "lor",
    specialistLabel: "Vrach"
  },
  "nurse-entries": {
    title: "Nurse yozuvlari",
    subtitle: "Nurse bo'limi yozuvlari, to'lov va qarzlar.",
    lockedType: "nurse",
    specialistLabel: "Medsestra"
  },
  "lor-entries": {
    title: "LOR yozuvlari",
    subtitle: "LOR bo'limi yozuvlari, to'lov va qarzlar.",
    lockedType: "lor",
    specialistLabel: "Vrach"
  },
  journal: {
    title: "Kassa jurnali",
    subtitle: "Barcha yozuvlar umumiy jurnal ko'rinishi.",
    lockedType: null,
    specialistLabel: "Mutaxassis"
  },
  "nurse-specialists": {
    title: "Nurse shifokorlar",
    subtitle: "Nurse mutaxassislar ro'yxatini boshqarish.",
    lockedType: "nurse",
    specialistLabel: "Medsestra"
  },
  "lor-specialists": {
    title: "LOR shifokorlar",
    subtitle: "LOR mutaxassislar ro'yxatini boshqarish.",
    lockedType: "lor",
    specialistLabel: "Vrach"
  }
};

const departmentLabels = {
  lor: "LOR",
  nurse: "Nurse",
  procedure: "Nurse"
};

const paymentMethodLabels = {
  cash: "Naqd",
  card: "Karta",
  transfer: "O'tkazma"
};

const getTodayString = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatDateInput = (value) => {
  if (!value) return getTodayString();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return getTodayString();
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const safeNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const createInitialForm = (type = "lor") => ({
  department: type,
  specialistType: type,
  specialistId: "",
  patientName: "",
  amount: "",
  paidAmount: "",
  paymentMethod: "cash",
  patientPhone: "",
  note: ""
});

const emptySummary = {
  totalAmount: 0,
  totalPaidAmount: 0,
  totalDebtAmount: 0,
  totalEntries: 0,
  bySpecialistType: {
    nurse: { count: 0 },
    lor: { count: 0 }
  }
};

function SummaryCard({ title, value, hint, tone = "default" }) {
  const tones = {
    default: "border-slate-200 bg-white",
    primary: "border-cyan-200 bg-cyan-50",
    accent: "border-orange-200 bg-orange-50"
  };

  return (
    <div className={`rounded-xl border p-4 ${tones[tone] || tones.default}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{title}</p>
      <p className="mt-2 text-2xl font-bold text-slate-800">{value}</p>
      <p className="mt-1 text-sm text-slate-600">{hint}</p>
    </div>
  );
}

function CashierDashboard({ forcedSection = "nurse-patients" }) {
  const today = useMemo(() => getTodayString(), []);
  const sectionMeta = SECTION_META[forcedSection] || SECTION_META["nurse-patients"];
  const lockedType = sectionMeta.lockedType;
  const isSpecialistSection =
    forcedSection === "nurse-specialists" || forcedSection === "lor-specialists";
  const isFormSection = forcedSection === "nurse-patients" || forcedSection === "lor-patients";
  const isEntriesSection =
    forcedSection === "nurse-entries" ||
    forcedSection === "lor-entries" ||
    forcedSection === "journal";
  const specialistPageType = forcedSection === "nurse-specialists" ? "nurse" : "lor";

  const [loading, setLoading] = useState(true);
  const [savingEntry, setSavingEntry] = useState(false);
  const [deletingEntry, setDeletingEntry] = useState(false);
  const [savingSpecialist, setSavingSpecialist] = useState(false);
  const [deletingSpecialist, setDeletingSpecialist] = useState(false);
  const [entries, setEntries] = useState([]);
  const [summary, setSummary] = useState(emptySummary);
  const [specialists, setSpecialists] = useState([]);
  const [filters, setFilters] = useState({
    date: today,
    department: lockedType || "all",
    specialistType: lockedType || "all",
    paymentMethod: "all",
    debtOnly: false,
    search: ""
  });
  const [searchInput, setSearchInput] = useState("");
  const [form, setForm] = useState(createInitialForm(lockedType || "lor"));
  const [editingEntry, setEditingEntry] = useState(null);
  const [deleteEntryTarget, setDeleteEntryTarget] = useState(null);
  const [specialistNameInput, setSpecialistNameInput] = useState("");
  const [deleteSpecialistTarget, setDeleteSpecialistTarget] = useState(null);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const specialistsByType = useMemo(
    () => ({
      nurse: specialists.filter((item) => item.type === "nurse"),
      lor: specialists.filter((item) => item.type === "lor")
    }),
    [specialists]
  );

  const selectedTypeSpecialists = useMemo(() => {
    const type = lockedType || form.specialistType;
    return specialistsByType[type] || [];
  }, [specialistsByType, form.specialistType, lockedType]);

  const buildEffectiveFilters = (baseFilters) => {
    if (!lockedType) {
      return baseFilters;
    }

    return {
      ...baseFilters,
      department: lockedType,
      specialistType: lockedType
    };
  };

  const effectiveFilters = useMemo(() => buildEffectiveFilters(filters), [filters, lockedType]);

  const calculatedDebt = useMemo(() => {
    const amount = safeNumber(form.amount, 0);
    const paid = form.paidAmount === "" ? amount : safeNumber(form.paidAmount, 0);
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    if (!Number.isFinite(paid) || paid < 0) return amount;
    return Math.max(amount - Math.min(paid, amount), 0);
  }, [form.amount, form.paidAmount]);

  const tableData = useMemo(
    () => entries.map((entry, index) => ({ ...entry, rowNumber: index + 1 })),
    [entries]
  );

  const resetMessages = () => {
    setSuccess("");
    setError("");
  };

  const loadEntries = async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
    }

    try {
      const [entriesPayload, summaryPayload] = await Promise.all([
        cashierService.getEntries(effectiveFilters),
        cashierService.getSummary(effectiveFilters)
      ]);

      setEntries(entriesPayload?.entries || []);
      setSummary(summaryPayload || emptySummary);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const loadSpecialists = async () => {
    try {
      const data = await cashierService.getSpecialists({ type: "all" });
      setSpecialists(data);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  useEffect(() => {
    if (lockedType) {
      setFilters((prev) => ({
        ...prev,
        department: lockedType,
        specialistType: lockedType
      }));

      setForm((prev) => ({
        ...prev,
        department: lockedType,
        specialistType: lockedType
      }));
    }
  }, [lockedType]);

  useEffect(() => {
    if (!isSpecialistSection) {
      loadEntries();
    } else {
      setLoading(false);
    }
  }, [
    isSpecialistSection,
    effectiveFilters.date,
    effectiveFilters.department,
    effectiveFilters.specialistType,
    effectiveFilters.paymentMethod,
    effectiveFilters.debtOnly,
    effectiveFilters.search
  ]);

  useEffect(() => {
    loadSpecialists();
  }, []);

  const resetForm = () => {
    setEditingEntry(null);
    setForm(createInitialForm(lockedType || form.specialistType || "lor"));
  };

  const handleFormChange = (key, value) => {
    if (lockedType && (key === "specialistType" || key === "department")) {
      return;
    }

    if (key === "specialistType") {
      setForm((prev) => ({
        ...prev,
        specialistType: value,
        specialistId: "",
        department: value
      }));
      return;
    }

    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveEntry = async (event) => {
    event.preventDefault();
    resetMessages();
    setSavingEntry(true);

    try {
      const specialistType = lockedType || form.specialistType;
      const department = lockedType || form.department || specialistType;
      const selectedSpecialist = selectedTypeSpecialists.find((item) => item._id === form.specialistId);

      if (!form.patientName.trim()) {
        throw new Error("Bemor F.I.O kiritilishi shart.");
      }

      if (!form.specialistId || !selectedSpecialist) {
        throw new Error("Mutaxassis ro'yxatdan tanlanishi shart.");
      }

      const payload = {
        department,
        specialistType,
        specialistId: form.specialistId,
        specialistName: selectedSpecialist.name,
        patientName: form.patientName.trim(),
        amount: safeNumber(form.amount),
        paidAmount:
          form.paidAmount === "" ? safeNumber(form.amount) : safeNumber(form.paidAmount),
        paymentMethod: form.paymentMethod,
        patientPhone: form.patientPhone.trim(),
        note: form.note.trim()
      };

      if (editingEntry?._id) {
        await cashierService.updateEntry(editingEntry._id, payload);
        setSuccess("Yozuv yangilandi.");
      } else {
        await cashierService.createEntry(payload);
        setSuccess("Yozuv qo'shildi.");
      }

      resetForm();
      await loadEntries({ silent: true });
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSavingEntry(false);
    }
  };

  const startEditEntry = (entry) => {
    resetMessages();

    const inferredType =
      entry.specialistType === "nurse" || entry.specialistType === "lor"
        ? entry.specialistType
        : entry.department === "nurse"
          ? "nurse"
          : "lor";

    setEditingEntry(entry);
    setForm({
      department: lockedType || entry.department || inferredType,
      specialistType: lockedType || inferredType,
      specialistId: entry.specialistId || "",
      patientName: entry.patientName || "",
      amount: safeNumber(entry.amount, "").toString(),
      paidAmount:
        entry.paidAmount === undefined || entry.paidAmount === null
          ? safeNumber(entry.amount, "").toString()
          : safeNumber(entry.paidAmount, "").toString(),
      paymentMethod: entry.paymentMethod || "cash",
      patientPhone: entry.patientPhone || "",
      note: entry.note || ""
    });
  };

  const handleDeleteEntry = async () => {
    if (!deleteEntryTarget?._id) return;

    setDeletingEntry(true);
    resetMessages();

    try {
      await cashierService.deleteEntry(deleteEntryTarget._id);
      setDeleteEntryTarget(null);
      setSuccess("Yozuv o'chirildi.");
      await loadEntries({ silent: true });
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setDeletingEntry(false);
    }
  };

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    setFilters((prev) => ({ ...prev, search: searchInput.trim() }));
  };

  const handleAddSpecialist = async () => {
    resetMessages();
    setSavingSpecialist(true);

    try {
      const name = specialistNameInput.trim();
      if (!name) {
        throw new Error("Mutaxassis nomini kiriting.");
      }

      await cashierService.createSpecialist({ type: specialistPageType, name });
      setSpecialistNameInput("");
      setSuccess("Mutaxassis qo'shildi.");
      await loadSpecialists();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSavingSpecialist(false);
    }
  };

  const handleDeleteSpecialist = async () => {
    if (!deleteSpecialistTarget?._id) return;

    setDeletingSpecialist(true);
    resetMessages();

    try {
      await cashierService.deleteSpecialist(deleteSpecialistTarget._id);
      setDeleteSpecialistTarget(null);
      setSuccess("Mutaxassis o'chirildi.");
      await loadSpecialists();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setDeletingSpecialist(false);
    }
  };

  if (loading) {
    return <Spinner text="Kassa paneli yuklanmoqda..." />;
  }

  if (isSpecialistSection) {
    const specialistsData = specialistsByType[specialistPageType] || [];
    const specialistRoleLabel = specialistPageType === "nurse" ? "Nurse" : "LOR";

    return (
      <div className="space-y-6">
        <div className="card p-4 sm:p-5">
          <h1 className="text-xl font-bold text-slate-800">{sectionMeta.title}</h1>
          <p className="mt-1 text-sm text-slate-500">{sectionMeta.subtitle}</p>
        </div>

        <div className="card p-4 sm:p-5">
          <h2 className="text-lg font-semibold text-slate-800">{specialistRoleLabel} qo'shish</h2>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input
              value={specialistNameInput}
              onChange={(e) => setSpecialistNameInput(e.target.value)}
              placeholder={`Masalan: ${specialistRoleLabel} 1`}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-primary focus:ring-4 focus:ring-primary/10"
            />
            <Button onClick={handleAddSpecialist} loading={savingSpecialist}>
              Qo'shish
            </Button>
          </div>
        </div>

        <div className="card p-4 sm:p-5">
          <h2 className="text-lg font-semibold text-slate-800">Ro'yxat</h2>
          <div className="mt-3">
            <Table
              data={specialistsData}
              columns={[
                { key: "name", label: specialistRoleLabel },
                {
                  key: "createdAt",
                  label: "Qo'shilgan sana",
                  render: (row) => formatDateInput(row.createdAt)
                },
                {
                  key: "actions",
                  label: "Amallar",
                  render: (row) => (
                    <button
                      type="button"
                      onClick={() => setDeleteSpecialistTarget(row)}
                      className="rounded-lg bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-200"
                    >
                      O'chirish
                    </button>
                  )
                }
              ]}
            />
          </div>
        </div>

        <Alert type="success" message={success} />
        <Alert type="error" message={error} />

        <ConfirmActionModal
          open={Boolean(deleteSpecialistTarget)}
          title="Mutaxassisni o'chirish"
          description={`${deleteSpecialistTarget?.name || "Tanlangan mutaxassis"} ni o'chirasizmi?`}
          confirmText="Ha, o'chirish"
          cancelText="Yo'q"
          loading={deletingSpecialist}
          onConfirm={handleDeleteSpecialist}
          onClose={() => setDeleteSpecialistTarget(null)}
        />
      </div>
    );
  }

  const specialistTitle = lockedType ? sectionMeta.specialistLabel : "Mutaxassis";
  const entryTableHeaderClass =
    lockedType === "nurse"
      ? "bg-rose-100 text-rose-800"
      : lockedType === "lor"
        ? "bg-sky-100 text-sky-800"
        : "bg-slate-100 text-slate-700";

  const entryColumns = [
    { key: "rowNumber", label: "No" },
    { key: "patientName", label: "F.I.O bemor" },
    {
      key: "amount",
      label: "Summa",
      render: (row) => `${formatCurrency(row.amount)} so'm`
    },
    {
      key: "paidAmount",
      label: "To'langan",
      render: (row) => `${formatCurrency(row.paidAmount ?? row.amount)} so'm`
    },
    {
      key: "debtAmount",
      label: "Qarz",
      render: (row) => `${formatCurrency(row.debtAmount || 0)} so'm`
    },
    {
      key: "paymentMethod",
      label: "To'lov usuli",
      render: (row) => paymentMethodLabels[row.paymentMethod] || row.paymentMethod
    },
    {
      key: "specialistName",
      label: specialistTitle
    },
    {
      key: "patientPhone",
      label: "Tel",
      render: (row) => row.patientPhone || "-"
    },
    {
      key: "entryDate",
      label: "Sana",
      render: (row) => formatDateInput(row.entryDate)
    },
    {
      key: "actions",
      label: "Amallar",
      render: (row) => (
        <div className="flex flex-wrap gap-2">
          {isFormSection ? (
            <button
              type="button"
              onClick={() => startEditEntry(row)}
              className="rounded-lg bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-300"
            >
              Tahrirlash
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setDeleteEntryTarget(row)}
            className="rounded-lg bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-200"
          >
            O'chirish
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <div className="card p-4 sm:p-5">
        <h1 className="text-xl font-bold text-slate-800">{sectionMeta.title}</h1>
        <p className="mt-1 text-sm text-slate-500">{sectionMeta.subtitle}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Jami summa"
          value={`${formatCurrency(summary.totalAmount)} so'm`}
          hint={`Yozuvlar: ${summary.totalEntries}`}
          tone="primary"
        />
        <SummaryCard
          title="To'langan"
          value={`${formatCurrency(summary.totalPaidAmount)} so'm`}
          hint="Amalda olingan to'lov"
        />
        <SummaryCard
          title="Qarz"
          value={`${formatCurrency(summary.totalDebtAmount)} so'm`}
          hint="Qolgan qarzdorlik"
          tone="accent"
        />
        <SummaryCard
          title="Nurse / LOR"
          value={`${summary.bySpecialistType?.nurse?.count || 0} / ${
            summary.bySpecialistType?.lor?.count || 0
          }`}
          hint="Mutaxassislar bo'yicha"
        />
      </div>

      {isFormSection ? (
        <div className="card p-4 sm:p-5">
          <h2 className="text-lg font-semibold text-slate-800">
            {editingEntry ? "Yozuvni tahrirlash" : "Yangi bemor yozuvi"}
          </h2>

          <form className="mt-4 space-y-3" onSubmit={handleSaveEntry}>
            <div className="grid gap-3 md:grid-cols-2">
              {!lockedType ? (
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-600">Bo'lim</span>
                  <select
                    value={form.department}
                    onChange={(e) => handleFormChange("department", e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
                  >
                    <option value="lor">LOR</option>
                    <option value="nurse">Nurse</option>
                  </select>
                </label>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <p className="text-xs text-slate-500">Bo'lim</p>
                  <p className="text-sm font-semibold text-slate-800">{departmentLabels[lockedType]}</p>
                </div>
              )}

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-600">
                  {specialistTitle} ro'yxati
                </span>
                <select
                  value={form.specialistId}
                  onChange={(e) => handleFormChange("specialistId", e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
                >
                  <option value="">Ro'yxatdan tanlang</option>
                  {selectedTypeSpecialists.map((item) => (
                    <option key={item._id} value={item._id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Input
                label="Bemor F.I.O"
                value={form.patientName}
                onChange={(e) => handleFormChange("patientName", e.target.value)}
                placeholder="Masalan: Ali Valiyev"
              />
              <Input
                label="Jami summa"
                type="number"
                min="1"
                max="999999"
                value={form.amount}
                onChange={(e) => handleFormChange("amount", e.target.value)}
                placeholder="Masalan: 120000"
              />
              <Input
                label="To'langan summa"
                type="number"
                min="0"
                max="999999"
                value={form.paidAmount}
                onChange={(e) => handleFormChange("paidAmount", e.target.value)}
                placeholder="Masalan: 100000"
              />
              <Input
                label="Telefon"
                value={form.patientPhone}
                onChange={(e) => handleFormChange("patientPhone", e.target.value)}
                placeholder="Masalan: 90 123 45 67"
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-600">To'lov usuli</span>
                <select
                  value={form.paymentMethod}
                  onChange={(e) => handleFormChange("paymentMethod", e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
                >
                  <option value="cash">Naqd</option>
                  <option value="card">Karta</option>
                  <option value="transfer">O'tkazma</option>
                </select>
              </label>

              <div className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-orange-700">Qarz</p>
                <p className="mt-1 text-lg font-bold text-orange-800">{formatCurrency(calculatedDebt)} so'm</p>
              </div>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-600">Izoh</span>
              <textarea
                value={form.note}
                onChange={(e) => handleFormChange("note", e.target.value)}
                rows={2}
                placeholder="Qo'shimcha izoh (ixtiyoriy)"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-primary focus:ring-4 focus:ring-primary/10"
              />
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" loading={savingEntry}>
                {editingEntry ? "Yangilash" : "Qo'shish"}
              </Button>
              {editingEntry ? (
                <Button type="button" variant="secondary" onClick={resetForm}>
                  Bekor qilish
                </Button>
              ) : null}
            </div>
          </form>
        </div>
      ) : null}

      {isEntriesSection ? (
        <>
          <div className="card p-4 sm:p-5">
            <h2 className="text-lg font-semibold text-slate-800">Filtrlar</h2>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <Input
                label="Sana"
                type="date"
                value={filters.date}
                onChange={(e) => setFilters((prev) => ({ ...prev, date: e.target.value || today }))}
              />

              {!lockedType ? (
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-600">Bo'lim</span>
                  <select
                    value={filters.department}
                    onChange={(e) =>
                      setFilters((prev) => ({ ...prev, department: e.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
                  >
                    <option value="all">Barchasi</option>
                    <option value="lor">LOR</option>
                    <option value="nurse">Nurse</option>
                  </select>
                </label>
              ) : null}

              {!lockedType ? (
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-600">
                    Mutaxassis turi
                  </span>
                  <select
                    value={filters.specialistType}
                    onChange={(e) =>
                      setFilters((prev) => ({ ...prev, specialistType: e.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
                  >
                    <option value="all">Barchasi</option>
                    <option value="nurse">Nurse</option>
                    <option value="lor">LOR</option>
                  </select>
                </label>
              ) : null}

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-600">To'lov usuli</span>
                <select
                  value={filters.paymentMethod}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, paymentMethod: e.target.value }))
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
                >
                  <option value="all">Barchasi</option>
                  <option value="cash">Naqd</option>
                  <option value="card">Karta</option>
                  <option value="transfer">O'tkazma</option>
                </select>
              </label>

              <label className="flex items-end">
                <span className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={filters.debtOnly}
                    onChange={(e) =>
                      setFilters((prev) => ({ ...prev, debtOnly: e.target.checked }))
                    }
                  />
                  Faqat qarzdorlar
                </span>
              </label>
            </div>

            <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={handleSearchSubmit}>
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Bemor yoki mutaxassis bo'yicha qidirish..."
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-primary focus:ring-4 focus:ring-primary/10"
              />
              <Button type="submit" variant="secondary">
                Qidirish
              </Button>
            </form>
          </div>

          <div className="card p-4 sm:p-5">
            <h2 className="text-lg font-semibold text-slate-800">Yozuvlar</h2>
            <div className="mt-4">
              <Table
                data={tableData}
                columns={entryColumns}
                headerClassName={entryTableHeaderClass}
              />
            </div>
          </div>
        </>
      ) : null}

      <Alert type="success" message={success} />
      <Alert type="error" message={error} />

      <ConfirmActionModal
        open={Boolean(deleteEntryTarget)}
        title="Yozuvni o'chirish"
        description={`${deleteEntryTarget?.patientName || "Tanlangan yozuv"} yozuvini o'chirasizmi?`}
        confirmText="Ha, o'chirish"
        cancelText="Yo'q"
        loading={deletingEntry}
        onConfirm={handleDeleteEntry}
        onClose={() => setDeleteEntryTarget(null)}
      />
    </div>
  );
}

export default CashierDashboard;
