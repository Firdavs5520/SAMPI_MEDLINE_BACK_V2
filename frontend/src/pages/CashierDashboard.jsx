import { useEffect, useMemo, useState } from "react";
import Input from "../components/Input.jsx";
import Button from "../components/Button.jsx";
import Alert from "../components/Alert.jsx";
import Spinner from "../components/Spinner.jsx";
import Table from "../components/Table.jsx";
import SelectMenu from "../components/SelectMenu.jsx";
import DatePickerField from "../components/DatePickerField.jsx";
import QuickSearchInput from "../components/QuickSearchInput.jsx";
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
    title: "Nurse cheklar qabuli",
    subtitle: "Nurse yuborgan cheklar kassada qabul qilinadi.",
    lockedType: "nurse",
    specialistLabel: "Medsestra"
  },
  "lor-patients": {
    title: "LOR cheklar qabuli",
    subtitle: "LOR yuborgan cheklar kassada qabul qilinadi.",
    lockedType: "lor",
    specialistLabel: "Vrach"
  },
  "nurse-entries": {
    title: "Nurse yozuvlari",
    subtitle: "Joriy ro'yxat 08:00-02:00 oralig'ida ko'rsatiladi.",
    lockedType: "nurse",
    specialistLabel: "Medsestra"
  },
  "nurse-history": {
    title: "Nurse tarixi",
    subtitle: "Nurse bo'yicha 08:00-02:00 dan tashqari yozuvlar tarixi.",
    lockedType: "nurse",
    specialistLabel: "Medsestra"
  },
  "lor-entries": {
    title: "LOR yozuvlari",
    subtitle: "Joriy ro'yxat 08:00-02:00 oralig'ida ko'rsatiladi.",
    lockedType: "lor",
    specialistLabel: "Vrach"
  },
  "lor-history": {
    title: "LOR tarixi",
    subtitle: "LOR bo'yicha 08:00-02:00 dan tashqari yozuvlar tarixi.",
    lockedType: "lor",
    specialistLabel: "Vrach"
  },
  journal: {
    title: "Kassa jurnali",
    subtitle: "Barcha yozuvlar umumiy jurnal ko'rinishi.",
    lockedType: null,
    specialistLabel: "Mutaxassis"
  },
  debts: {
    title: "Qarzdorlar ro'yxati",
    subtitle: "Qarz qolgan yozuvlarni yakuniy to'lash bo'limi.",
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

const formatCreatorRoleLabel = (value) =>
  String(value || "").toLowerCase() === "nurse" ? "Nurse" : "LOR";

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
  const isDebtSection = forcedSection === "debts";
  const isEntriesSection =
    forcedSection === "nurse-entries" ||
    forcedSection === "nurse-history" ||
    forcedSection === "lor-entries" ||
    forcedSection === "lor-history" ||
    forcedSection === "journal" ||
    isDebtSection;
  const isCurrentEntriesSection =
    forcedSection === "nurse-entries" ||
    forcedSection === "lor-entries" ||
    forcedSection === "journal";
  const shouldShowSummaryCards =
    forcedSection === "nurse-entries" ||
    forcedSection === "nurse-history" ||
    forcedSection === "lor-entries" ||
    forcedSection === "lor-history" ||
    forcedSection === "journal" ||
    isDebtSection;
  const specialistPageType = forcedSection === "nurse-specialists" ? "nurse" : "lor";

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [savingEntry, setSavingEntry] = useState(false);
  const [savingSpecialist, setSavingSpecialist] = useState(false);
  const [pendingChecksLoading, setPendingChecksLoading] = useState(false);
  const [entries, setEntries] = useState([]);
  const [historyEntries, setHistoryEntries] = useState([]);
  const [pendingChecks, setPendingChecks] = useState([]);
  const [pendingSearch, setPendingSearch] = useState("");
  const [selectedPendingCheck, setSelectedPendingCheck] = useState(null);
  const [shiftWindow, setShiftWindow] = useState({
    fromLabel: "08:00",
    toLabel: "02:00"
  });
  const [summary, setSummary] = useState(emptySummary);
  const [specialists, setSpecialists] = useState([]);
  const [filters, setFilters] = useState({
    date: today,
    department: lockedType || "all",
    specialistType: lockedType || "all",
    paymentMethod: "all",
    debtOnly: isDebtSection,
    search: ""
  });
  const [searchInput, setSearchInput] = useState("");
  const [form, setForm] = useState(createInitialForm(lockedType || "lor"));
  const [specialistNameInput, setSpecialistNameInput] = useState("");
  const [closingDebtId, setClosingDebtId] = useState("");
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const isPendingCheckMode = Boolean(selectedPendingCheck?._id);

  const specialistsByType = useMemo(
    () => ({
      nurse: specialists.filter((item) => item.type === "nurse"),
      lor: specialists.filter((item) => item.type === "lor")
    }),
    [specialists]
  );

  const buildEffectiveFilters = (baseFilters) => {
    const nextFilters = { ...baseFilters };

    if (lockedType) {
      nextFilters.department = lockedType;
      nextFilters.specialistType = lockedType;
    }

    if (isDebtSection) {
      nextFilters.debtOnly = true;
    }

    return nextFilters;
  };

  const effectiveFilters = useMemo(
    () => buildEffectiveFilters(filters),
    [filters, lockedType, isDebtSection]
  );
  const availableSpecialistTypeOptions = useMemo(() => {
    if (lockedType === "lor" || filters.department === "lor") {
      return specialistTypeOptions.filter(
        (item) => item.value === "all" || item.value === "lor"
      );
    }

    if (lockedType === "nurse" || filters.department === "nurse") {
      return specialistTypeOptions.filter(
        (item) => item.value === "all" || item.value === "nurse"
      );
    }

    return specialistTypeOptions;
  }, [lockedType, filters.department]);

  const calculatedDebt = useMemo(() => {
    const amount = safeNumber(form.amount, 0);
    const paid = form.paidAmount === "" ? 0 : safeNumber(form.paidAmount, 0);
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
  const pendingSuggestionItems = useMemo(
    () =>
      pendingChecks.map((item) => ({
        ...item,
        _searchLabel: `${item.checkId || ""} - ${item.patientName || "-"}`
      })),
    [pendingChecks]
  );
  const entrySuggestionItems = useMemo(() => {
    const source = isHistorySection ? historyEntries : entries;
    const unique = new Map();

    source.forEach((row) => {
      const patientName = String(row?.patientName || "").trim();
      const specialistName = String(row?.specialistName || "").trim();
      const patientPhone = String(row?.patientPhone || "").trim();

      if (patientName) {
        const key = `patient:${patientName.toLowerCase()}`;
        if (!unique.has(key)) {
          unique.set(key, { id: key, label: patientName });
        }
      }

      if (specialistName) {
        const key = `specialist:${specialistName.toLowerCase()}`;
        if (!unique.has(key)) {
          unique.set(key, { id: key, label: specialistName });
        }
      }

      if (patientPhone) {
        const key = `phone:${patientPhone.toLowerCase()}`;
        if (!unique.has(key)) {
          unique.set(key, { id: key, label: patientPhone });
        }
      }
    });

    return Array.from(unique.values());
  }, [entries, historyEntries, isHistorySection]);

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
        if (isDebtSection) {
          const [entriesPayload, summaryPayload] = await Promise.all([
            cashierService.getEntries({ ...effectiveFilters, timeScope: "all", debtOnly: true }),
            cashierService.getSummary({ ...effectiveFilters, timeScope: "all", debtOnly: true })
          ]);

          setEntries(entriesPayload?.entries || []);
          setHistoryEntries([]);
          setShiftWindow(
            entriesPayload?.shift || {
              fromLabel: "08:00",
              toLabel: "02:00"
            }
          );
          setSummary(summaryPayload || emptySummary);
        } else if (isHistorySection) {
          const [historyPayload, summaryPayload] = await Promise.all([
            cashierService.getEntries({ ...effectiveFilters, timeScope: "history" }),
            cashierService.getSummary({ ...effectiveFilters, timeScope: "history" })
          ]);

          setEntries([]);
          setHistoryEntries(historyPayload?.entries || []);
          setShiftWindow(
            historyPayload?.shift || {
              fromLabel: "08:00",
              toLabel: "02:00"
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
              toLabel: "02:00"
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
            toLabel: "02:00"
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

  const loadPendingChecks = async ({ searchValue = "" } = {}) => {
    if (!isFormSection) {
      setPendingChecks([]);
      return;
    }

    setPendingChecksLoading(true);
    try {
      const data = await cashierService.getPendingChecks({
        role: lockedType || "all",
        search: searchValue
      });
      setPendingChecks(data || []);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setPendingChecksLoading(false);
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
    if (isDebtSection) {
      setFilters((prev) => ({ ...prev, debtOnly: true }));
    }
  }, [isDebtSection]);

  useEffect(() => {
    if (lockedType) return;

    if (filters.department === "lor" && filters.specialistType === "nurse") {
      setFilters((prev) => ({ ...prev, specialistType: "lor" }));
      return;
    }

    if (filters.department === "nurse" && filters.specialistType === "lor") {
      setFilters((prev) => ({ ...prev, specialistType: "nurse" }));
    }
  }, [lockedType, filters.department, filters.specialistType]);

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
    isDebtSection,
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

  useEffect(() => {
    if (isFormSection) {
      loadPendingChecks({ searchValue: "" });
      return;
    }

    setPendingChecks([]);
    setPendingSearch("");
    setSelectedPendingCheck(null);
  }, [isFormSection, lockedType]);

  useEffect(() => {
    if (!isFormSection || isPendingCheckMode) {
      return;
    }

    const timer = setTimeout(() => {
      loadPendingChecks({ searchValue: pendingSearch.trim() });
    }, 220);

    return () => clearTimeout(timer);
  }, [isFormSection, isPendingCheckMode, pendingSearch, lockedType]);

  useEffect(() => {
    if (!isEntriesSection) {
      return;
    }

    const timer = setTimeout(() => {
      setFilters((prev) => ({ ...prev, search: searchInput.trim() }));
    }, 220);

    return () => clearTimeout(timer);
  }, [isEntriesSection, searchInput]);

  const resetForm = () => {
    setSelectedPendingCheck(null);
    setForm(createInitialForm(lockedType || "lor"));
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
      const isPendingCheckMode = Boolean(selectedPendingCheck?._id);
      if (!isPendingCheckMode) {
        throw new Error("Avval qabul qilinadigan chekni tanlang.");
      }

      if (String(form.paidAmount || "").trim() === "") {
        throw new Error("To'langan summani kiriting.");
      }

      const paidAmount = safeNumber(form.paidAmount);
      const checkTotal = safeNumber(selectedPendingCheck.total);
      if (paidAmount > checkTotal) {
        throw new Error("To'langan summa chek summasidan oshmasligi kerak.");
      }

      const payload = {
        checkRef: selectedPendingCheck._id,
        paidAmount,
        paymentMethod: form.paymentMethod,
        patientPhone: form.patientPhone.trim(),
        note: form.note.trim()
      };

      await cashierService.createEntry(payload);
      setSuccess("Chek kassada qabul qilindi.");

      resetForm();
      await loadEntries({ silent: true });
      if (isFormSection) {
        await loadPendingChecks({ searchValue: pendingSearch.trim() });
      }
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSavingEntry(false);
    }
  };

  const handlePickPendingCheck = (check) => {
    const roleType = String(check?.creatorRole || "").toLowerCase() === "nurse" ? "nurse" : "lor";
    const roleSpecialists = specialistsByType[roleType] || [];
    const foundSpecialist = roleSpecialists.find((item) => item.name === check.creatorName);

    setSelectedPendingCheck(check);
    setForm({
      department: roleType,
      specialistId: foundSpecialist?._id || "",
      patientName: toTitleCaseName(String(check.patientName || "")),
      amount: formatMoneyInput(check.total),
      paidAmount: "",
      paymentMethod: "cash",
      patientPhone: "",
      note: ""
    });
    resetMessages();
  };

  const clearPendingCheckSelection = () => {
    setSelectedPendingCheck(null);
    resetForm();
  };

  const handleMarkDebtAsPaid = async (entry) => {
    if (!entry?._id) return;

    const currentDebt = safeNumber(entry.debtAmount, 0);
    if (currentDebt <= 0) {
      setSuccess("Bu yozuvda qarz qolmagan.");
      return;
    }

    resetMessages();
    setClosingDebtId(entry._id);

    try {
      const totalAmount = safeNumber(entry.amount, 0);
      if (totalAmount <= 0) {
        throw new Error("Yozuv summasi noto'g'ri.");
      }

      await cashierService.updateEntry(entry._id, {
        paidAmount: totalAmount,
        paymentMethod: entry.paymentMethod || "cash",
        note: entry.note || ""
      });

      setSuccess("Qarz to'landi. Yozuv oddiy ro'yxatga o'tdi.");
      await loadEntries({ silent: true });
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setClosingDebtId("");
    }
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
      render: (row) =>
        isDebtSection && safeNumber(row.debtAmount, 0) > 0 ? (
          <Button
            type="button"
            className="px-3 py-1.5 text-xs"
            loading={closingDebtId === row._id}
            onClick={() => handleMarkDebtAsPaid(row)}
          >
            To'landi
          </Button>
        ) : (
          <span className="text-xs text-slate-400">-</span>
        )
    }
  ];

  const specialistCountValue = isDebtSection
    ? `${summary.totalEntries || 0}`
    : lockedType
      ? `${summary.bySpecialistType?.[lockedType]?.count || 0}`
      : `${summary.bySpecialistType?.nurse?.count || 0} / ${
          summary.bySpecialistType?.lor?.count || 0
        }`;
  const specialistCountTitle = isDebtSection
    ? "Qarzdorlar soni"
    : lockedType
      ? `${departmentLabels[lockedType]} yozuvlari`
      : "Nurse / LOR";
  const specialistCountHint = isDebtSection
    ? "Qarz qolgan yozuvlar"
    : lockedType
      ? "Joriy ro'yxatdagi mutaxassislar soni"
      : "Mutaxassislar bo'yicha";
  const sectionTheme = isDebtSection
    ? {
        headerCard: "border-amber-200 bg-amber-50/80",
        badge: "bg-amber-100 text-amber-800 border border-amber-200",
        alertBox: "border-amber-200 bg-amber-50 text-amber-800",
        formCard: "",
        submitButton: ""
      }
    : lockedType === "nurse"
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
  const sectionLabel = isDebtSection
    ? "QARZDORLAR BO'LIMI"
    : lockedType
      ? `${departmentLabels[lockedType]} BO'LIMI`
      : "KASSA JURNALI";
  const sectionWarningText = isDebtSection
    ? "Bu bo'limda qarzi qolgan yozuvlar chiqadi. To'liq to'langanda \"To'landi\" ni bosing."
    : lockedType
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
        <div className="space-y-4 sm:space-y-5">
          <div
            className={`card p-4 sm:p-5 transition-all duration-300 ${
              isPendingCheckMode ? "border-cyan-300 ring-2 ring-cyan-100" : ""
            }`}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">Qabul qilinadigan cheklar</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Kassir yangi yozuv yaratmaydi, faqat nurse/LOR yuborgan chekni qabul qiladi.
                </p>
              </div>
              {pendingChecksLoading ? (
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Yuklanmoqda...
                </span>
              ) : null}
            </div>

            <div
              className={`overflow-hidden transition-all duration-500 ${
                isPendingCheckMode
                  ? "pointer-events-none max-h-0 opacity-0"
                  : "mt-3 max-h-[1200px] opacity-100"
              }`}
            >
              <div className="mt-2">
                <QuickSearchInput
                  label="Chek qidirish"
                  placeholder="Chek ID yoki bemor F.I.O bo'yicha qidirish..."
                  value={pendingSearch}
                  onChange={setPendingSearch}
                  items={pendingSuggestionItems}
                  getItemLabel={(item) => item?._searchLabel || ""}
                  onPick={(item) => {
                    setPendingSearch(item?.checkId || item?.patientName || "");
                    handlePickPendingCheck(item);
                  }}
                  emptyText="Mos chek topilmadi"
                />
              </div>

              <div className="mt-3">
                <Table
                  data={pendingChecks}
                  columns={[
                    { key: "checkId", label: "Chek ID" },
                    { key: "patientName", label: "Bemor F.I.O" },
                    {
                      key: "total",
                      label: "Jami summa",
                      render: (row) => `${formatCurrency(row.total)} so'm`
                    },
                    {
                      key: "creatorRole",
                      label: "Kim yubordi",
                      render: (row) =>
                        `${formatCreatorRoleLabel(row.creatorRole)}: ${row.creatorName || "-"}${
                          String(row.creatorRole).toLowerCase() === "lor" && row.lorIdentity
                            ? ` (${String(row.lorIdentity).toUpperCase().replace("LOR", "LOR-")})`
                            : ""
                        }`
                    },
                    {
                      key: "createdAt",
                      label: "Yuborilgan vaqt",
                      render: (row) => formatDateInput(row.createdAt)
                    },
                    {
                      key: "actions",
                      label: "Amallar",
                      render: (row) => (
                        <Button
                          type="button"
                          className="px-3 py-1.5 text-xs"
                          onClick={() => handlePickPendingCheck(row)}
                        >
                          Qabul qilish
                        </Button>
                      )
                    }
                  ]}
                />
              </div>
            </div>

            <div
              className={`overflow-hidden transition-all duration-500 ${
                isPendingCheckMode
                  ? "mt-3 max-h-80 opacity-100"
                  : "pointer-events-none max-h-0 opacity-0"
              }`}
            >
              <div className="rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-3 text-sm text-cyan-900">
                <p className="font-semibold">Qabul jarayoni boshlandi</p>
                <p>Bemor: {selectedPendingCheck?.patientName || "-"}</p>
                <p>Jami: {formatCurrency(selectedPendingCheck?.total || 0)} so'm</p>
                <p>Sana: {formatDateInput(selectedPendingCheck?.createdAt)}</p>
                <p>
                  {String(selectedPendingCheck?.creatorRole || "").toLowerCase() === "nurse"
                    ? "Hamshira"
                    : "Doktor"}
                  : {selectedPendingCheck?.creatorName || "-"}
                </p>
                {String(selectedPendingCheck?.creatorRole || "").toLowerCase() === "lor" &&
                selectedPendingCheck?.lorIdentity ? (
                  <p>
                    {String(selectedPendingCheck.lorIdentity).toUpperCase().replace("LOR", "LOR-")}
                  </p>
                ) : null}
                <div className="mt-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full sm:w-auto"
                    onClick={clearPendingCheckSelection}
                  >
                    Boshqa chekni tanlash
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div
            className={`card p-4 sm:p-5 ${sectionTheme.formCard} transition-all duration-300 ${
              isPendingCheckMode ? "opacity-100" : "opacity-80"
            }`}
          >
            <h2 className="text-lg font-semibold text-slate-800">Chekni kassada qabul qilish</h2>

            {!isPendingCheckMode ? (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                Avval yuqoridagi ro'yxatdan bitta chek tanlang. Shundan keyin qabul qilish formasi ochiladi.
              </div>
            ) : (
              <form className="mt-4 space-y-3" onSubmit={handleSaveEntry}>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <p className="text-xs text-slate-500">Bo'lim</p>
                    <p className="text-sm font-semibold text-slate-800">
                      {departmentLabels[lockedType || form.department || "lor"]}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <p className="text-xs text-slate-500">Mutaxassis</p>
                    <p className="text-sm font-semibold text-slate-800">
                      {selectedPendingCheck?.creatorName || "-"}
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <Input
                    label="Bemor F.I.O"
                    value={form.patientName}
                    onChange={(e) => handleFormChange("patientName", e.target.value)}
                    placeholder="Masalan: Ali Valiyev"
                    readOnly
                  />
                  <Input
                    label="Jami summa"
                    type="text"
                    inputMode="numeric"
                    maxLength={7}
                    value={form.amount}
                    onChange={(e) => handleFormChange("amount", e.target.value)}
                    placeholder="Masalan: 120 000"
                    readOnly
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
                    <p className="mt-1 text-lg font-bold text-orange-800">
                      {formatCurrency(calculatedDebt)} so'm
                    </p>
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
                    Chekni qabul qilish
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full sm:w-auto"
                    onClick={clearPendingCheckSelection}
                  >
                    Bekor qilish
                  </Button>
                </div>
              </form>
            )}
          </div>
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
              {isDebtSection
                ? "Faqat qarzdorlar ko'rsatiladi. Qarz yopilgach yozuv oddiy ro'yxatga qaytadi."
                : isHistorySection
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
                    setFilters((prev) => {
                      const next = { ...prev, department: nextValue };

                      if (nextValue === "lor" && prev.specialistType === "nurse") {
                        next.specialistType = "lor";
                      } else if (nextValue === "nurse" && prev.specialistType === "lor") {
                        next.specialistType = "nurse";
                      }

                      return next;
                    })
                  }
                />
              ) : null}

              {!lockedType ? (
                <SelectMenu
                  label="Mutaxassis turi"
                  value={filters.specialistType}
                  options={availableSpecialistTypeOptions}
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
                    checked={isDebtSection ? true : filters.debtOnly}
                    disabled={isDebtSection}
                    onChange={(e) =>
                      setFilters((prev) => ({ ...prev, debtOnly: e.target.checked }))
                    }
                  />
                  {isDebtSection ? "Qarz filtri doim yoqilgan" : "Faqat qarzdorlar"}
                </span>
              </label>
            </div>

            <div className="mt-3">
              <QuickSearchInput
                label="Bemor yoki mutaxassis qidirish"
                placeholder="Bemor yoki mutaxassis bo'yicha qidirish..."
                value={searchInput}
                onChange={setSearchInput}
                items={entrySuggestionItems}
                getItemLabel={(item) => item?.label || ""}
                onPick={(item) => setSearchInput(item?.label || "")}
                emptyText="Mos yozuv topilmadi"
              />
            </div>
          </div>

          {isDebtSection ? (
            <div className="card p-4 sm:p-5">
              <h2 className="text-lg font-semibold text-slate-800">Qarzdorlar ro'yxati</h2>
              <p className="mt-1 text-sm text-slate-500">
                Qarz to'liq yopilganda <strong>To'landi</strong> tugmasini bosing.
              </p>
              <div className="mt-4">
                <Table
                  data={tableData}
                  columns={entryColumns}
                  headerClassName="bg-amber-100 text-amber-900"
                />
              </div>
            </div>
          ) : isCurrentEntriesSection ? (
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
