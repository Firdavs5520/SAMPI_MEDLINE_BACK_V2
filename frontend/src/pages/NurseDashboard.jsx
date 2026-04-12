import { useEffect, useMemo, useRef, useState } from "react";
import medicineService from "../services/medicineService.js";
import serviceService from "../services/serviceService.js";
import usageService from "../services/usageService.js";
import Input from "../components/Input.jsx";
import Button from "../components/Button.jsx";
import Spinner from "../components/Spinner.jsx";
import Alert from "../components/Alert.jsx";
import BusyOverlay from "../components/BusyOverlay.jsx";
import QuickSearchInput from "../components/QuickSearchInput.jsx";
import SelectMenu from "../components/SelectMenu.jsx";
import {
  extractErrorMessage,
  formatCurrency,
  splitFullName,
  toTitleCaseName
} from "../utils/format.js";
import {
  closePrintTab,
  openPendingPrintTab,
  writeCheckToPrintTab
} from "../utils/printReceipt.js";

const STEP_LABELS = [
  "1. Hamshira",
  "2. Bemor",
  "3. Dorilar",
  "4. Xizmatlar",
  "5. Chek preview"
];
const PRICE_TIER_LABELS = { first: "1-marta", second: "2-marta", third: "3-marta" };
const PRICE_TIER_ORDER = ["first", "second", "third"];
const PRICE_TIER_OPTIONS = PRICE_TIER_ORDER.map((value) => ({
  value,
  label: PRICE_TIER_LABELS[value]
}));

const isValidPrice = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n < 1000000;
};

const normalizeSearch = (value) =>
  String(value ?? "")
    .toLocaleLowerCase("uz-UZ")
    .trim();

const safeQty = (value, max = Number.MAX_SAFE_INTEGER) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "1";
  return String(Math.max(1, Math.min(Math.floor(n), Math.floor(max))));
};

const getTierPrices = (service) => {
  const first = Number(service?.priceOptions?.first);
  const second = Number(service?.priceOptions?.second);
  const third = Number(service?.priceOptions?.third);
  if (isValidPrice(first) && isValidPrice(second) && isValidPrice(third)) {
    return { first, second, third };
  }
  const base = Number(service?.price);
  if (isValidPrice(base)) return { first: base, second: base, third: base };
  return null;
};

const getServicePrice = (service, tier) => {
  const tiers = getTierPrices(service);
  if (!tiers) return null;
  return tiers[PRICE_TIER_ORDER.includes(tier) ? tier : "first"];
};

function NurseDashboard() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [creatingSpecialist, setCreatingSpecialist] = useState(false);
  const [step, setStep] = useState(1);

  const [specialists, setSpecialists] = useState([]);
  const [selectedSpecialistId, setSelectedSpecialistId] = useState("");
  const [newSpecialistName, setNewSpecialistName] = useState("");
  const [specialistSearch, setSpecialistSearch] = useState("");

  const [medicines, setMedicines] = useState([]);
  const [services, setServices] = useState([]);
  const [patient, setPatient] = useState({ fullName: "" });
  const [selectedMedicineIds, setSelectedMedicineIds] = useState([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState([]);
  const [medicineInputs, setMedicineInputs] = useState({});
  const [serviceInputs, setServiceInputs] = useState({});
  const [medicineSearch, setMedicineSearch] = useState("");
  const [serviceSearch, setServiceSearch] = useState("");
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const previewRef = useRef(null);

  const hasAnySelection = selectedMedicineIds.length > 0 || selectedServiceIds.length > 0;

  const specialistOptions = useMemo(
    () =>
      specialists.map((item) => ({
        value: item._id,
        label: item.name
      })),
    [specialists]
  );

  const selectedSpecialist = useMemo(
    () => specialists.find((item) => item._id === selectedSpecialistId) || null,
    [specialists, selectedSpecialistId]
  );

  const filteredSpecialists = useMemo(() => {
    const q = normalizeSearch(specialistSearch);
    if (!q) return specialists;
    return specialists.filter((item) => normalizeSearch(item?.name).includes(q));
  }, [specialists, specialistSearch]);

  const filteredMedicines = useMemo(() => {
    const q = normalizeSearch(medicineSearch);
    if (!q) return medicines;
    return medicines.filter((m) => normalizeSearch(m?.name).includes(q));
  }, [medicines, medicineSearch]);

  const filteredServices = useMemo(() => {
    const q = normalizeSearch(serviceSearch);
    if (!q) return services;
    return services.filter((s) => normalizeSearch(s?.name).includes(q));
  }, [services, serviceSearch]);

  const previewMedicines = useMemo(
    () =>
      selectedMedicineIds
        .map((id) => {
          const medicine = medicines.find((m) => m._id === id);
          if (!medicine) return null;
          const quantity = Number(medicineInputs[id]?.quantity || 1);
          const lineTotal = quantity * Number(medicine.price || 0);
          return { id, name: medicine.name, quantity, lineTotal };
        })
        .filter(Boolean),
    [selectedMedicineIds, medicines, medicineInputs]
  );

  const previewServices = useMemo(
    () =>
      selectedServiceIds
        .map((id) => {
          const service = services.find((s) => s._id === id);
          if (!service) return null;
          const quantity = Number(serviceInputs[id]?.quantity || 1);
          const tier = PRICE_TIER_ORDER.includes(serviceInputs[id]?.priceTier)
            ? serviceInputs[id]?.priceTier
            : "first";
          const unitPrice = Number(getServicePrice(service, tier) || 0);
          const lineTotal = quantity * unitPrice;
          return { id, name: service.name, quantity, tier, lineTotal };
        })
        .filter(Boolean),
    [selectedServiceIds, services, serviceInputs]
  );

  const previewTotal = useMemo(() => {
    const m = previewMedicines.reduce((sum, item) => sum + item.lineTotal, 0);
    const s = previewServices.reduce((sum, item) => sum + item.lineTotal, 0);
    return m + s;
  }, [previewMedicines, previewServices]);

  const resetMessages = () => {
    setSuccess("");
    setError("");
  };

  const loadSpecialists = async () => {
    const data = await usageService.getRoleSpecialists();
    setSpecialists(data);

    setSelectedSpecialistId((prev) => {
      if (prev && data.some((item) => item._id === prev)) return prev;
      return data[0]?._id || "";
    });
  };

  const loadData = async () => {
    setLoading(true);
    setError("");

    try {
      const [medicineData, serviceData] = await Promise.all([
        medicineService.getAllMedicines(),
        serviceService.getAllServices(),
        loadSpecialists()
      ]);
      setMedicines(medicineData);
      setServices(serviceData.filter((item) => item.type === "nurse"));
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (step === 5 && previewRef.current) previewRef.current.focus();
  }, [step]);

  useEffect(() => {
    setSelectedMedicineIds((prev) =>
      prev.filter((id) => medicines.some((m) => m._id === id && m.stock > 0 && isValidPrice(m.price)))
    );
  }, [medicines]);

  useEffect(() => {
    setSelectedServiceIds((prev) =>
      prev.filter((id) => services.some((s) => s._id === id && !!getTierPrices(s)))
    );
  }, [services]);

  const validateSpecialist = () => {
    if (!selectedSpecialistId) {
      throw new Error("Avval hamshirani tanlang.");
    }
  };

  const validatePatient = () => {
    const { firstName, lastName } = splitFullName(patient.fullName);
    if (!firstName.trim() || !lastName.trim()) {
      throw new Error("Bemor F.I.O ni to'liq kiriting (ismi va familiyasi).");
    }
  };

  const handleCreateSpecialist = async () => {
    if (creatingSpecialist) return;

    resetMessages();
    const safeName = toTitleCaseName(newSpecialistName).trim();
    if (!safeName) {
      setError("Hamshira nomini kiriting.");
      return;
    }

    setCreatingSpecialist(true);
    try {
      const created = await usageService.createRoleSpecialist({ name: safeName });
      const next = await usageService.getRoleSpecialists();
      setSpecialists(next);
      setSelectedSpecialistId(created?._id || next[0]?._id || "");
      setNewSpecialistName("");
      setSpecialistSearch("");
      setSuccess("Yangi hamshira qo'shildi.");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setCreatingSpecialist(false);
    }
  };

  const toggleMedicine = (medicineId, canUse) => {
    if (!canUse) return;
    setSelectedMedicineIds((prev) => {
      if (prev.includes(medicineId)) return prev.filter((id) => id !== medicineId);
      setMedicineInputs((v) => ({ ...v, [medicineId]: { quantity: v[medicineId]?.quantity || "1" } }));
      return [...prev, medicineId];
    });
  };

  const toggleService = (serviceId, canUse) => {
    if (!canUse) return;
    setSelectedServiceIds((prev) => {
      if (prev.includes(serviceId)) return prev.filter((id) => id !== serviceId);
      setServiceInputs((v) => ({
        ...v,
        [serviceId]: { quantity: v[serviceId]?.quantity || "1", priceTier: v[serviceId]?.priceTier || "first" }
      }));
      return [...prev, serviceId];
    });
  };

  const goNextFromSpecialist = () => {
    resetMessages();
    try {
      validateSpecialist();
      setStep(2);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const goNextFromPatient = () => {
    resetMessages();
    try {
      validatePatient();
      setStep(3);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const handleCheckout = async () => {
    if (submitting) return;
    resetMessages();
    setSubmitting(true);
    let printSession = null;

    try {
      validateSpecialist();
      validatePatient();
      if (!hasAnySelection) throw new Error("Kamida bitta dori yoki xizmat tanlang.");

      const parsedPatient = splitFullName(patient.fullName);
      const medicinesPayload = selectedMedicineIds.map((id) => {
        const medicine = medicines.find((m) => m._id === id);
        if (!medicine) throw new Error("Tanlangan dori topilmadi.");
        const quantity = Number(medicineInputs[id]?.quantity || 1);
        if (quantity <= 0) throw new Error("Miqdor noto'g'ri.");
        if (medicine.stock < quantity) throw new Error(`${medicine.name} uchun qoldiq yetarli emas.`);
        return { medicineId: id, quantity };
      });

      const servicesPayload = selectedServiceIds.map((id) => {
        const service = services.find((s) => s._id === id);
        if (!service) throw new Error("Tanlangan xizmat topilmadi.");
        const quantity = Number(serviceInputs[id]?.quantity || 1);
        const priceTier = PRICE_TIER_ORDER.includes(serviceInputs[id]?.priceTier)
          ? serviceInputs[id]?.priceTier
          : "first";
        if (!isValidPrice(getServicePrice(service, priceTier))) {
          throw new Error(`${service.name} uchun narx sozlanmagan.`);
        }
        return { serviceId: id, quantity, priceTier };
      });

      printSession = openPendingPrintTab();
      const result = await usageService.createCheckout({
        patient: {
          firstName: parsedPatient.firstName.trim(),
          lastName: parsedPatient.lastName.trim()
        },
        specialistId: selectedSpecialistId,
        specialistName: selectedSpecialist?.name || "",
        medicines: medicinesPayload,
        services: servicesPayload
      });

      const printed = writeCheckToPrintTab(printSession, result.check);
      if (!printed) setError("Brauzer yangi oynani blokladi. Ruxsat bering.");
      setSuccess("Chek muvaffaqiyatli yaratildi.");
      setPatient({ fullName: "" });
      setSelectedMedicineIds([]);
      setSelectedServiceIds([]);
      setMedicineInputs({});
      setServiceInputs({});
      setMedicineSearch("");
      setServiceSearch("");
      setStep(1);
      void loadData();
    } catch (err) {
      closePrintTab(printSession);
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Spinner text="Hamshira paneli yuklanmoqda..." />;

  return (
    <div className="space-y-6">
      <div className="card border-rose-200 bg-rose-50/70 p-4 sm:p-5">
        <h1 className="text-xl font-bold text-slate-800">Hamshira paneli</h1>
        <p className="mt-1 text-sm text-slate-600">Bosqichma-bosqich chek yaratish</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-5">
          {STEP_LABELS.map((label, i) => {
            const n = i + 1;
            const active = n === step;
            const done = n < step;
            return (
              <div
                key={label}
                className={`rounded-xl border px-3 py-2 text-center text-xs font-semibold ${active ? "border-primary bg-cyan-50 text-primary" : done ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-500"}`}
              >
                {label}
              </div>
            );
          })}
        </div>
      </div>

      {step === 1 ? (
        <div className="card border-rose-200 p-4 sm:p-5">
          <h2 className="text-lg font-semibold">1-qadam: Hamshira tanlash</h2>
          <p className="mb-4 text-sm text-slate-600">
            Avval chekni kim yaratishini tanlang yoki yangi hamshira qo'shing.
          </p>

          <div className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
            <Input
              label="Yangi hamshira"
              value={newSpecialistName}
              placeholder="Masalan: Malika"
              onChange={(e) => setNewSpecialistName(toTitleCaseName(e.target.value))}
            />
            <div className="md:col-span-2 flex items-end">
              <Button
                type="button"
                loading={creatingSpecialist}
                className="w-full bg-rose-600 hover:bg-rose-700 focus:ring-rose-300"
                onClick={handleCreateSpecialist}
              >
                Hamshira qo'shish
              </Button>
            </div>
          </div>

          <div className="mt-4">
            <QuickSearchInput
              label="Hamshira qidirish"
              placeholder="Masalan: Malika"
              value={specialistSearch}
              onChange={setSpecialistSearch}
              items={specialists}
              getItemLabel={(item) => item?.name || ""}
              onPick={(item) => {
                setSelectedSpecialistId(item?._id || "");
                setSpecialistSearch(item?.name || "");
              }}
              emptyText="Mos hamshira topilmadi"
            />
          </div>

          {specialistOptions.length ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filteredSpecialists.map((item) => {
                const selected = selectedSpecialistId === item._id;
                return (
                  <button
                    key={item._id}
                    type="button"
                    onClick={() => setSelectedSpecialistId(item._id)}
                    className={`rounded-xl border px-3 py-3 text-left transition ${
                      selected
                        ? "border-primary bg-cyan-50"
                        : "border-slate-200 bg-white hover:border-primary/50"
                    }`}
                  >
                    <p className="font-semibold text-slate-800">{item.name}</p>
                    <p className="mt-1 text-xs font-medium text-slate-500">
                      {selected ? "Tanlangan" : "Tanlash uchun bosing"}
                    </p>
                  </button>
                );
              })}
            </div>
          ) : null}

          {!specialistOptions.length ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Hozircha hamshira yo'q. Avval yangi hamshira qo'shing.
            </div>
          ) : null}

          <div className="mt-4 flex justify-end">
            <Button
              className="bg-rose-600 hover:bg-rose-700 focus:ring-rose-300"
              onClick={goNextFromSpecialist}
            >
              Keyingi: Bemor
            </Button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="card border-rose-200 p-4 sm:p-5">
          <h2 className="text-lg font-semibold">2-qadam: Bemor F.I.O</h2>
          <Input
            label="Bemor F.I.O"
            value={patient.fullName}
            placeholder="Masalan: Ali Valiyev"
            onChange={(e) => setPatient({ fullName: toTitleCaseName(e.target.value) })}
          />
          <div className="mt-4 flex justify-between">
            <Button variant="secondary" onClick={() => setStep(1)}>
              Orqaga
            </Button>
            <Button
              className="bg-rose-600 hover:bg-rose-700 focus:ring-rose-300"
              onClick={goNextFromPatient}
            >
              Keyingi: Dorilar
            </Button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="card border-rose-200 p-4 sm:p-5">
          <h2 className="text-lg font-semibold">3-qadam: Dorilar</h2>
          <QuickSearchInput
            label="Dori qidirish"
            placeholder="Masalan: Paracetamol"
            value={medicineSearch}
            onChange={setMedicineSearch}
            items={medicines}
            getItemLabel={(item) => item?.name || ""}
            onPick={(item) => setMedicineSearch(item?.name || "")}
            emptyText="Mos dori topilmadi"
          />
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredMedicines.map((medicine) => {
              const selected = selectedMedicineIds.includes(medicine._id);
              const blocked = medicine.stock <= 0 || !isValidPrice(medicine.price);
              return (
                <button
                  key={medicine._id}
                  type="button"
                  disabled={blocked}
                  onClick={() => toggleMedicine(medicine._id, !blocked)}
                  className={`rounded-xl border px-3 py-3 text-left ${selected ? "border-primary bg-cyan-50" : blocked ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-white"}`}
                >
                  <p className="font-semibold">{medicine.name}</p>
                  <p className="text-xs text-slate-600">Qoldiq: {medicine.stock}</p>
                  <p className="text-xs text-slate-500">
                    Narx: {isValidPrice(medicine.price) ? formatCurrency(medicine.price) : "-"}
                  </p>
                </button>
              );
            })}
          </div>

          {selectedMedicineIds.length > 0 ? (
            <div className="mt-4 space-y-3">
              {selectedMedicineIds.map((id) => {
                const medicine = medicines.find((m) => m._id === id);
                return (
                  <div
                    key={id}
                    className="grid gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-[1fr_180px_auto]"
                  >
                    <div>
                      <p className="font-medium">{medicine?.name}</p>
                      <p className="text-xs text-slate-500">Qoldiq: {medicine?.stock}</p>
                    </div>
                    <Input
                      label="Miqdor"
                      type="number"
                      min="1"
                      max={Math.max(Number(medicine?.stock || 1), 1)}
                      value={medicineInputs[id]?.quantity || ""}
                      onChange={(e) =>
                        setMedicineInputs((prev) => ({
                          ...prev,
                          [id]: { quantity: safeQty(e.target.value, medicine?.stock || 1) }
                        }))
                      }
                    />
                    <Button variant="secondary" className="h-fit self-end" onClick={() => toggleMedicine(id, true)}>
                      Olib tashlash
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : null}

          <div className="mt-4 flex justify-between">
            <Button variant="secondary" onClick={() => setStep(2)}>
              Orqaga
            </Button>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setSelectedMedicineIds([]);
                  setMedicineInputs({});
                  setStep(4);
                }}
              >
                Skip
              </Button>
              <Button
                className="bg-rose-600 hover:bg-rose-700 focus:ring-rose-300"
                onClick={() => setStep(4)}
              >
                Keyingi
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {step === 4 ? (
        <div className="card border-rose-200 p-4 sm:p-5">
          <h2 className="text-lg font-semibold">4-qadam: Xizmatlar</h2>
          <QuickSearchInput
            label="Xizmat qidirish"
            placeholder="Masalan: Ukol qilish"
            value={serviceSearch}
            onChange={setServiceSearch}
            items={services}
            getItemLabel={(item) => item?.name || ""}
            onPick={(item) => setServiceSearch(item?.name || "")}
            emptyText="Mos xizmat topilmadi"
          />
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredServices.map((service) => {
              const selected = selectedServiceIds.includes(service._id);
              const blocked = !getTierPrices(service);
              return (
                <button
                  key={service._id}
                  type="button"
                  disabled={blocked}
                  onClick={() => toggleService(service._id, !blocked)}
                  className={`rounded-xl border px-3 py-3 text-left ${selected ? "border-primary bg-cyan-50" : blocked ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-white"}`}
                >
                  <p className="font-semibold">{service.name}</p>
                  <p className="text-xs text-slate-500">
                    1/2/3: {getServicePrice(service, "first") ? formatCurrency(getServicePrice(service, "first")) : "-"} / {getServicePrice(service, "second") ? formatCurrency(getServicePrice(service, "second")) : "-"} / {getServicePrice(service, "third") ? formatCurrency(getServicePrice(service, "third")) : "-"}
                  </p>
                </button>
              );
            })}
          </div>

          {selectedServiceIds.length > 0 ? (
            <div className="mt-4 space-y-3">
              {selectedServiceIds.map((id) => {
                const service = services.find((s) => s._id === id);
                const tier = PRICE_TIER_ORDER.includes(serviceInputs[id]?.priceTier)
                  ? serviceInputs[id]?.priceTier
                  : "first";
                return (
                  <div
                    key={id}
                    className="grid gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-[1fr_160px_180px_auto]"
                  >
                    <div>
                      <p className="font-medium">{service?.name}</p>
                      <p className="text-xs text-slate-500">
                        Narx: {formatCurrency(getServicePrice(service, tier) || 0)}
                      </p>
                    </div>
                    <Input
                      label="Miqdor"
                      type="number"
                      min="1"
                      value={serviceInputs[id]?.quantity || ""}
                      onChange={(e) =>
                        setServiceInputs((prev) => ({
                          ...prev,
                          [id]: {
                            quantity: safeQty(e.target.value),
                            priceTier: prev[id]?.priceTier || "first"
                          }
                        }))
                      }
                    />
                    <SelectMenu
                      label="Narx turi"
                      value={tier}
                      options={PRICE_TIER_OPTIONS}
                      onChange={(nextTier) =>
                        setServiceInputs((prev) => ({
                          ...prev,
                          [id]: {
                            quantity: prev[id]?.quantity || "1",
                            priceTier: nextTier
                          }
                        }))
                      }
                    />
                    <Button variant="secondary" className="h-fit self-end" onClick={() => toggleService(id, true)}>
                      Olib tashlash
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : null}

          <div className="mt-4 flex justify-between">
            <Button variant="secondary" onClick={() => setStep(3)}>
              Orqaga
            </Button>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setSelectedServiceIds([]);
                  setServiceInputs({});
                  setStep(5);
                }}
              >
                Skip
              </Button>
              <Button
                className="bg-rose-600 hover:bg-rose-700 focus:ring-rose-300"
                onClick={() => setStep(5)}
              >
                Keyingi
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {step === 5 ? (
        <div
          ref={previewRef}
          tabIndex={0}
          className="card border-rose-200 p-4 outline-none sm:p-5"
          onKeyDown={(e) => {
            if (e.key === "Enter" && hasAnySelection && !submitting) {
              e.preventDefault();
              handleCheckout();
            }
          }}
        >
          <h2 className="text-lg font-semibold">5-qadam: Chek preview</h2>
          <p className="mb-3 text-sm text-slate-600">Enter bosib chek chiqaring.</p>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm">
              Hamshira: <span className="font-semibold">{selectedSpecialist?.name || "-"}</span>
            </p>
            <p className="text-sm">
              Bemor: <span className="font-semibold">{patient.fullName || "-"}</span>
            </p>
            <div className="mt-3 space-y-1">
              <p className="text-sm font-semibold">Dorilar</p>
              {previewMedicines.length ? (
                previewMedicines.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span>
                      {item.name} x{item.quantity}
                    </span>
                    <span className="font-semibold">{formatCurrency(item.lineTotal)}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">Tanlanmagan</p>
              )}
            </div>
            <div className="mt-3 space-y-1">
              <p className="text-sm font-semibold">Xizmatlar</p>
              {previewServices.length ? (
                previewServices.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span>
                      {item.name} ({PRICE_TIER_LABELS[item.tier]}) x{item.quantity}
                    </span>
                    <span className="font-semibold">{formatCurrency(item.lineTotal)}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">Tanlanmagan</p>
              )}
            </div>
            <div className="mt-3 border-t border-dashed border-slate-300 pt-2">
              <div className="flex justify-between text-base font-bold">
                <span>Jami</span>
                <span>{formatCurrency(previewTotal)}</span>
              </div>
            </div>
          </div>

          {!hasAnySelection ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Chek chiqarish uchun kamida bitta dori yoki bitta xizmat tanlanishi kerak.
            </div>
          ) : null}

          <div className="mt-4 flex justify-between">
            <Button variant="secondary" onClick={() => setStep(4)}>
              Orqaga
            </Button>
            <Button
              disabled={!hasAnySelection}
              loading={submitting}
              className="bg-rose-600 hover:bg-rose-700 focus:ring-rose-300"
              onClick={handleCheckout}
            >
              Chek chiqarish (Enter)
            </Button>
          </div>
        </div>
      ) : null}

      <Alert type="success" message={success} />
      <Alert type="error" message={error} />
      <BusyOverlay show={submitting} text="Chek yaratilmoqda..." />
    </div>
  );
}

export default NurseDashboard;
