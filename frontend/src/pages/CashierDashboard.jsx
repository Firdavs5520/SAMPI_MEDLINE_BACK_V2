import { useEffect, useMemo, useState } from "react";
import Input from "../components/Input.jsx";
import Button from "../components/Button.jsx";
import Alert from "../components/Alert.jsx";
import Spinner from "../components/Spinner.jsx";
import Table from "../components/Table.jsx";
import SelectMenu from "../components/SelectMenu.jsx";
import DatePickerField from "../components/DatePickerField.jsx";
import cashierService from "../services/cashierService.js";
import {
  extractErrorMessage,
  formatCurrency,
  formatMoneyInput,
  formatPhoneInput,
  toTitleCaseName
} from "../utils/format.js";

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
    subtitle: "Joriy ro'yxat 08:00-20:00 oralig'ida ko'rsatiladi.",
    lockedType: "nurse",
    specialistLabel: "Medsestra"
  },
  "nurse-history": {
    title: "Nurse tarixi",
    subtitle: "Nurse bo'yicha 08:00-20:00 dan tashqari yozuvlar tarixi.",
    lockedType: "nurse",
    specialistLabel: "Medsestra"
  },
  "lor-entries": {
    title: "LOR yozuvlari",
    subtitle: "Joriy ro'yxat 08:00-20:00 oralig'ida ko'rsatiladi.",
    lockedType: "lor",
    specialistLabel: "Vrach"
  },
  "lor-history": {
    title: "LOR tarixi",
    subtitle: "LOR bo'yicha 08:00-20:00 dan tashqari yozuvlar tarixi.",
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

const paymentMethodOptions = [
  { value: "all", label: "Barchasi" },
  { value: "cash", label: "Naqd" },
  { value: "card", label: "Karta" },
  { value: "transfer", label: "O'tkazma" }
];

const paymentMethodFormOptions = [
  { value: "cash", label: "Naqd" },
  { value: "card", label: "Karta" },
  { value: "transfer", label: "O'tkazma" }
];

const departmentOptions = [
  { value: "all", label: "Barchasi" },
  { value: "lor", label: "LOR" },
  { value: "nurse", label: "Nurse" }
];

const departmentFormOptions = [
  { value: "lor", label: "LOR" },
  { value: "nurse", label: "Nurse" }
];

const specialistTypeOptions = [
  { value: "all", label: "Barchasi" },
  { value: "nurse", label: "Nurse" },
  { value: "lor", label: "LOR" }
];

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
  const normalized =
    typeof value === "string" ? value.replace(/[^\d.-]/g, "") : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const createInitialForm = (type = "lor") => ({
  department: type,
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
  const isHistorySection = forcedSection === "nurse-history" || forcedSection === "lor-history";
  const isEntriesSection =
    forcedSection === "nurse-entries" ||
    forcedSection === "nurse-history" ||
    forcedSection === "lor-entries" ||
    forcedSection === "lor-history" ||
    forcedSection === "journal";
  const isCurrentEntriesSection =
    forcedSection === "nurse-entries" ||
    forcedSection === "lor-entries" ||
    forcedSection === "journal";
  const shouldShowSummaryCards =
    forcedSection === "nurse-entries" ||
    forcedSection === "nurse-history" ||
    forcedSection === "lor-entries" ||
    forcedSection === "lor-history" ||
    forcedSection === "journal";
  const specialistPageType = forcedSection === "nurse-specialists" ? "nurse" : "lor";

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [savingEntry, setSavingEntry] = useState(false);
  const [savingSpecialist, setSavingSpecialist] = useState(false);
  const [entries, setEntries] = useState([]);
  const [historyEntries, setHistoryEntries] = useState([]);
  const [shiftWindow, setShiftWindow] = useState({
    fromLabel: "08:00",
    toLabel: "20:00"
  });
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
  const [specialistNameInput, setSpecialistNameInput] = useState("");
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
    const type = lockedType || form.department || "lor";
    return specialistsByType[type] || [];
  }, [specialistsByType, form.department, lockedType]);

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
  const historyTableData = useMemo(
    () => historyEntries.map((entry, index) => ({ ...entry, rowNumber: index + 1 })),
    [historyEntries]
  );

  const resetMessages = () => {
    setSuccess("");
    setError("");
  };

  const loadEntries = async ({ silent = false } = {}) => {
    const shouldUseSilent = silent || hasLoadedOnce;

    if (!shouldUseSilent) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      if (isEntriesSection) {
        if (isHistorySection) {
          const [historyPayload, summaryPayload] = await Promise.all([
            cashierService.getEntries({ ...effectiveFilters, timeScope: "history" }),
            cashierService.getSummary({ ...effectiveFilters, timeScope: "history" })
          ]);

          setEntries([]);
          setHistoryEntries(historyPayload?.entries || []);
          setShiftWindow(
            historyPayload?.shift || {
              fromLabel: "08:00",
              toLabel: "20:00"
            }
          );
          setSummary(summaryPayload || emptySummary);
        } else {
          const [activePayload, summaryPayload] = await Promise.all([
            cashierService.getEntries({ ...effectiveFilters, timeScope: "active" }),
            cashierService.getSummary({ ...effectiveFilters, timeScope: "active" })
          ]);

          setEntries(activePayload?.entries || []);
          setHistoryEntries([]);
          setShiftWindow(
            activePayload?.shift || {
              fromLabel: "08:00",
              toLabel: "20:00"
            }
          );
          setSummary(summaryPayload || emptySummary);
        }
      } else {
        const [entriesPayload, summaryPayload] = await Promise.all([
          cashierService.getEntries({ ...effectiveFilters, timeScope: "active" }),
          cashierService.getSummary({ ...effectiveFilters, timeScope: "active" })
        ]);

        setEntries(entriesPayload?.entries || []);
        setHistoryEntries([]);
        setShiftWindow(
          entriesPayload?.shift || {
            fromLabel: "08:00",
            toLabel: "20:00"
          }
        );
        setSummary(summaryPayload || emptySummary);
      }
      setHasLoadedOnce(true);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      if (!shouldUseSilent) {
        setLoading(false);
      }
      setRefreshing(false);
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
        specialistId: ""
      }));
    }
  }, [lockedType]);

  useEffect(() => {
    if (!isSpecialistSection) {
      loadEntries();
    } else {
      setEntries([]);
      setHistoryEntries([]);
      setLoading(false);
      setRefreshing(false);
    }
  }, [
    isHistorySection,
    isEntriesSection,
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
    setForm(createInitialForm(lockedType || form.department || "lor"));
  };

  const handleFormChange = (key, value) => {
    if (lockedType && key === "department") {
      return;
    }

    if (key === "department") {
      setForm((prev) => ({
        ...prev,
        specialistId: "",
        department: value
      }));
      return;
    }

    if (key === "patientName") {
      setForm((prev) => ({ ...prev, patientName: toTitleCaseName(value) }));
      return;
    }

    if (key === "patientPhone") {
      setForm((prev) => ({ ...prev, patientPhone: formatPhoneInput(value) }));
      return;
    }

    if (key === "amount" || key === "paidAmount") {
      setForm((prev) => ({ ...prev, [key]: formatMoneyInput(value) }));
      return;
    }

    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveEntry = async (event) => {
    event.preventDefault();
    resetMessages();
    setSavingEntry(true);

    try {
      const specialistType = lockedType || form.department || "lor";
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

    const inferredDepartment = entry.department === "nurse" ? "nurse" : "lor";

    setEditingEntry(entry);
    setForm({
      department: lockedType || entry.department || inferredDepartment,
      specialistId: entry.specialistId || "",
      patientName: entry.patientName || "",
      amount: formatMoneyInput(entry.amount),
      paidAmount:
        entry.paidAmount === undefined || entry.paidAmount === null
          ? formatMoneyInput(entry.amount)
          : formatMoneyInput(entry.paidAmount),
      paymentMethod: entry.paymentMethod || "cash",
      patientPhone: formatPhoneInput(entry.patientPhone || ""),
      note: entry.note || ""
    });
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

  if (loading) {
    return <Spinner text="Kassa paneli yuklanmoqda..." />;
  }

  if (isSpecialistSection) {
    const specialistsData = specialistsByType[specialistPageType] || [];
    const specialistRoleLabel = specialistPageType === "nurse" ? "Nurse" : "LOR";

    return (
      <div className="space-y-4 sm:space-y-6">
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
            <Button className="w-full sm:w-auto" onClick={handleAddSpecialist} loading={savingSpecialist}>
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
                  render: () => <span className="text-xs text-slate-400">-</span>
                }
              ]}
            />
          </div>
        </div>

        <Alert type="success" message={success} />
        <Alert type="error" message={error} />
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
        </div>
      )
    }
  ];

  const specialistCountValue = lockedType
    ? `${summary.bySpecialistType?.[lockedType]?.count || 0}`
    : `${summary.bySpecialistType?.nurse?.count || 0} / ${
        summary.bySpecialistType?.lor?.count || 0
      }`;
  const specialistCountTitle = lockedType
    ? `${departmentLabels[lockedType]} yozuvlari`
    : "Nurse / LOR";
  const specialistCountHint = lockedType
    ? "Joriy ro'yxatdagi mutaxassislar soni"
    : "Mutaxassislar bo'yicha";
  const sectionTheme =
    lockedType === "nurse"
      ? {
          headerCard: "border-rose-200 bg-rose-50/70",
          badge: "bg-rose-100 text-rose-800 border border-rose-200",
          alertBox: "border-rose-200 bg-rose-50 text-rose-800",
          formCard: "border-rose-200",
          submitButton: "bg-rose-600 hover:bg-rose-700 focus:ring-rose-300"
        }
      : lockedType === "lor"
        ? {
            headerCard: "border-sky-200 bg-sky-50/70",
            badge: "bg-sky-100 text-sky-800 border border-sky-200",
            alertBox: "border-sky-200 bg-sky-50 text-sky-800",
            formCard: "border-sky-200",
            submitButton: "bg-sky-600 hover:bg-sky-700 focus:ring-sky-300"
          }
        : {
            headerCard: "",
            badge: "bg-slate-100 text-slate-700 border border-slate-200",
            alertBox: "border-slate-200 bg-slate-50 text-slate-700",
            formCard: "",
            submitButton: ""
          };
  const sectionLabel = lockedType ? `${departmentLabels[lockedType]} BO'LIMI` : "KASSA JURNALI";
  const sectionWarningText = lockedType
    ? `Diqqat: Siz hozir faqat ${departmentLabels[lockedType]} yozuvlari bilan ishlayapsiz.`
    : "Umumiy jurnal rejimi: barcha bo'limlar ko'rinadi.";

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className={`card p-4 sm:p-5 ${sectionTheme.headerCard}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">{sectionMeta.title}</h1>
            <p className="mt-1 text-sm text-slate-500">{sectionMeta.subtitle}</p>
          </div>
          <span
            className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-bold tracking-wide ${sectionTheme.badge}`}
          >
            {sectionLabel}
          </span>
        </div>
        <div className={`mt-3 rounded-xl border px-3 py-2 text-sm font-medium ${sectionTheme.alertBox}`}>
          {sectionWarningText}
        </div>
      </div>

      {shouldShowSummaryCards ? (
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
            title={specialistCountTitle}
            value={specialistCountValue}
            hint={specialistCountHint}
          />
        </div>
      ) : null}

      {isFormSection ? (
        <div className={`card p-4 sm:p-5 ${sectionTheme.formCard}`}>
          <h2 className="text-lg font-semibold text-slate-800">
            {editingEntry ? "Yozuvni tahrirlash" : "Yangi bemor yozuvi"}
          </h2>

          <form className="mt-4 space-y-3" onSubmit={handleSaveEntry}>
            <div className="grid gap-3 md:grid-cols-2">
              {!lockedType ? (
                <SelectMenu
                  label="Bo'lim"
                  value={form.department}
                  options={departmentFormOptions}
                  onChange={(nextValue) => handleFormChange("department", nextValue)}
                />
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <p className="text-xs text-slate-500">Bo'lim</p>
                  <p className="text-sm font-semibold text-slate-800">{departmentLabels[lockedType]}</p>
                </div>
              )}

              <SelectMenu
                label={`${specialistTitle} ro'yxati`}
                value={form.specialistId}
                options={[
                  { value: "", label: "Ro'yxatdan tanlang" },
                  ...selectedTypeSpecialists.map((item) => ({
                    value: item._id,
                    label: item.name
                  }))
                ]}
                onChange={(nextValue) => handleFormChange("specialistId", nextValue)}
              />
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
                type="text"
                inputMode="numeric"
                maxLength={7}
                value={form.amount}
                onChange={(e) => handleFormChange("amount", e.target.value)}
                placeholder="Masalan: 120 000"
              />
              <Input
                label="To'langan summa"
                type="text"
                inputMode="numeric"
                maxLength={7}
                value={form.paidAmount}
                onChange={(e) => handleFormChange("paidAmount", e.target.value)}
                placeholder="Masalan: 100 000"
              />
              <Input
                label="Telefon"
                type="text"
                inputMode="numeric"
                maxLength={12}
                value={form.patientPhone}
                onChange={(e) => handleFormChange("patientPhone", e.target.value)}
                placeholder="Masalan: 90 123 45 67"
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <SelectMenu
                label="To'lov usuli"
                value={form.paymentMethod}
                options={paymentMethodFormOptions}
                onChange={(nextValue) => handleFormChange("paymentMethod", nextValue)}
              />

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

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <Button
                type="submit"
                loading={savingEntry}
                className={`w-full sm:w-auto ${sectionTheme.submitButton}`}
              >
                {editingEntry ? "Yangilash" : "Qo'shish"}
              </Button>
              {editingEntry ? (
                <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={resetForm}>
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
            {refreshing ? (
              <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Ma'lumot yangilanmoqda...
              </p>
            ) : null}
            <div className="mt-2 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-800">
              {isHistorySection
                ? `${shiftWindow.fromLabel} - ${shiftWindow.toLabel} oralig'idan tashqari yozuvlar tarixi.`
                : `Joriy ro'yxat faqat ${shiftWindow.fromLabel} - ${shiftWindow.toLabel}. Qolgan yozuvlar tarix bo'limida saqlanadi.`}
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <DatePickerField
                label="Sana"
                value={filters.date}
                onChange={(nextDate) => setFilters((prev) => ({ ...prev, date: nextDate || today }))}
              />

              {!lockedType ? (
                <SelectMenu
                  label="Bo'lim"
                  value={filters.department}
                  options={departmentOptions}
                  onChange={(nextValue) =>
                    setFilters((prev) => ({ ...prev, department: nextValue }))
                  }
                />
              ) : null}

              {!lockedType ? (
                <SelectMenu
                  label="Mutaxassis turi"
                  value={filters.specialistType}
                  options={specialistTypeOptions}
                  onChange={(nextValue) =>
                    setFilters((prev) => ({ ...prev, specialistType: nextValue }))
                  }
                />
              ) : null}

              <SelectMenu
                label="To'lov usuli"
                value={filters.paymentMethod}
                options={paymentMethodOptions}
                onChange={(nextValue) =>
                  setFilters((prev) => ({ ...prev, paymentMethod: nextValue }))
                }
              />

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
              <Button type="submit" variant="secondary" className="w-full sm:w-auto">
                Qidirish
              </Button>
            </form>
          </div>

          {isCurrentEntriesSection ? (
            <div className="card p-4 sm:p-5">
              <h2 className="text-lg font-semibold text-slate-800">
                Joriy yozuvlar ({shiftWindow.fromLabel} - {shiftWindow.toLabel})
              </h2>
              <div className="mt-4">
                <Table
                  data={tableData}
                  columns={entryColumns}
                  headerClassName={entryTableHeaderClass}
                />
              </div>
            </div>
          ) : (
            <div className="card p-4 sm:p-5">
              <h2 className="text-lg font-semibold text-slate-800">Tarix yozuvlari</h2>
              <p className="mt-1 text-sm text-slate-500">
                {shiftWindow.fromLabel} - {shiftWindow.toLabel} dan tashqari yozuvlar.
              </p>
              <div className="mt-4">
                <Table
                  data={historyTableData}
                  columns={entryColumns}
                  headerClassName="bg-slate-100 text-slate-700"
                />
              </div>
            </div>
          )}
        </>
      ) : null}

      <Alert type="success" message={success} />
      <Alert type="error" message={error} />
    </div>
  );
}

export default CashierDashboard;
