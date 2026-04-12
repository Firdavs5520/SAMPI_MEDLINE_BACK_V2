import { useEffect, useMemo, useRef, useState } from "react";
import serviceService from "../services/serviceService.js";
import usageService from "../services/usageService.js";
import Input from "../components/Input.jsx";
import Button from "../components/Button.jsx";
import Spinner from "../components/Spinner.jsx";
import Alert from "../components/Alert.jsx";
import BusyOverlay from "../components/BusyOverlay.jsx";
import QuickSearchInput from "../components/QuickSearchInput.jsx";
import { useAuth } from "../context/AuthContext.jsx";
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

const STEP_LABELS = ["1. Doktor", "2. Bemor", "3. Xizmatlar", "4. Chek preview"];

const normalizeSearch = (value) =>
  String(value ?? "")
    .toLocaleLowerCase("uz-UZ")
    .trim();

const safeQty = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "1";
  return String(Math.max(1, Math.floor(n)));
};

function LorServicesPage() {
  const { user, lorIdentity } = useAuth();

  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);
  const [submittingCheckout, setSubmittingCheckout] = useState(false);

  const [services, setServices] = useState([]);
  const [specialists, setSpecialists] = useState([]);
  const [selectedSpecialistId, setSelectedSpecialistId] = useState("");
  const [specialistSearch, setSpecialistSearch] = useState("");

  const [selectedServiceIds, setSelectedServiceIds] = useState([]);
  const [serviceInputs, setServiceInputs] = useState({});
  const [serviceSearch, setServiceSearch] = useState("");
  const [patient, setPatient] = useState({ fullName: "" });

  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const specialistSearchRef = useRef(null);
  const patientInputRef = useRef(null);
  const serviceSearchRef = useRef(null);
  const previewRef = useRef(null);

  const selectedSpecialist = useMemo(
    () => specialists.find((item) => item._id === selectedSpecialistId) || null,
    [specialists, selectedSpecialistId]
  );

  const filteredSpecialists = useMemo(() => {
    const q = normalizeSearch(specialistSearch);
    if (!q) return specialists;
    return specialists.filter((item) => normalizeSearch(item?.name).includes(q));
  }, [specialists, specialistSearch]);

  const sortedServices = useMemo(
    () =>
      [...services].sort((a, b) =>
        String(a?.name || "").localeCompare(String(b?.name || ""), "uz")
      ),
    [services]
  );

  const filteredServices = useMemo(() => {
    const query = normalizeSearch(serviceSearch);
    if (!query) return sortedServices;

    return sortedServices.filter((service) =>
      normalizeSearch(service?.name).includes(query)
    );
  }, [serviceSearch, sortedServices]);

  const previewServices = useMemo(
    () =>
      selectedServiceIds
        .map((serviceId) => {
          const service = sortedServices.find((item) => item._id === serviceId);
          if (!service) return null;
          const quantity = Number(serviceInputs[serviceId]?.quantity || 1);
          const lineTotal = quantity * Number(service.price || 0);

          return {
            id: serviceId,
            name: service.name,
            quantity,
            lineTotal
          };
        })
        .filter(Boolean),
    [selectedServiceIds, sortedServices, serviceInputs]
  );

  const previewTotal = useMemo(
    () => previewServices.reduce((sum, item) => sum + item.lineTotal, 0),
    [previewServices]
  );

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
      const currentUserId = String(user?.id || user?._id || "");
      const [allServices] = await Promise.all([
        serviceService.getAllServices(),
        loadSpecialists()
      ]);

      setServices(
        allServices.filter(
          (item) =>
            item.type === "lor" &&
            (!item.createdBy?.userId || String(item.createdBy.userId) === currentUserId)
        )
      );
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user?.id, user?._id]);

  useEffect(() => {
    const focusElement = (element) => {
      if (!element) return;
      setTimeout(() => {
        try {
          element.focus();
          if (typeof element.select === "function") element.select();
        } catch (error) {
          // no-op
        }
      }, 0);
    };

    if (step === 1) focusElement(specialistSearchRef.current);
    if (step === 2) focusElement(patientInputRef.current);
    if (step === 3) focusElement(serviceSearchRef.current);
    if (step === 4) focusElement(previewRef.current);
  }, [step]);

  useEffect(() => {
    setSelectedServiceIds((prev) =>
      prev.filter((id) => sortedServices.some((item) => item._id === id))
    );
  }, [sortedServices]);

  const validateSpecialist = () => {
    if (!selectedSpecialistId) {
      throw new Error("Avval doktorni tanlang.");
    }
  };

  const validatePatient = () => {
    const normalizedPatient = splitFullName(patient.fullName);
    const firstName = normalizedPatient.firstName.trim();
    const lastName = normalizedPatient.lastName.trim();

    if (!firstName || !lastName) {
      throw new Error("Bemor F.I.O ni to'liq kiriting (ismi va familiyasi).");
    }
  };

  const toggleService = (serviceId) => {
    setSelectedServiceIds((prev) => {
      const exists = prev.includes(serviceId);
      if (exists) {
        return prev.filter((id) => id !== serviceId);
      }

      setServiceInputs((prevInputs) => ({
        ...prevInputs,
        [serviceId]: {
          quantity: prevInputs[serviceId]?.quantity || "1"
        }
      }));

      return [...prev, serviceId];
    });
  };

  const updateServiceQuantity = (serviceId, value) => {
    setServiceInputs((prev) => ({
      ...prev,
      [serviceId]: {
        quantity: safeQty(value)
      }
    }));
  };

  const handleCreateCheckout = async () => {
    if (submittingCheckout) return;
    resetMessages();
    setSubmittingCheckout(true);
    let printTab = null;

    try {
      validateSpecialist();
      validatePatient();

      if (!lorIdentity) {
        throw new Error("LOR tanlovi topilmadi. Qayta kirib chiqing.");
      }

      if (selectedServiceIds.length === 0) {
        throw new Error("Kamida bitta xizmat tanlang.");
      }

      const normalizedPatient = splitFullName(patient.fullName);
      const firstName = normalizedPatient.firstName.trim();
      const lastName = normalizedPatient.lastName.trim();

      const servicesPayload = selectedServiceIds.map((serviceId) => {
        const service = sortedServices.find((item) => item._id === serviceId);
        if (!service) {
          throw new Error("Tanlangan xizmat topilmadi.");
        }
        const quantity = Number(serviceInputs[serviceId]?.quantity || 1);
        if (!Number.isFinite(quantity) || quantity <= 0) {
          throw new Error("Miqdor 0 dan katta bo'lishi kerak.");
        }

        return {
          serviceId,
          quantity
        };
      });

      printTab = openPendingPrintTab();
      const result = await usageService.createLorCheckout({
        services: servicesPayload,
        lorIdentity,
        specialistId: selectedSpecialistId,
        specialistName: selectedSpecialist?.name || "",
        patient: {
          firstName,
          lastName
        }
      });

      setSuccess("Chek muvaffaqiyatli yaratildi.");
      setPatient({ fullName: "" });
      setSelectedServiceIds([]);
      setServiceInputs({});
      setServiceSearch("");
      setStep(1);

      const written = writeCheckToPrintTab(printTab, result.check);
      if (!written) {
        setError("Brauzer yangi oynani blokladi. Oynaga ruxsatni yoqing.");
      }
    } catch (err) {
      closePrintTab(printTab);
      setError(extractErrorMessage(err));
    } finally {
      setSubmittingCheckout(false);
    }
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

  const goNextFromServices = () => {
    resetMessages();
    setStep(4);
  };

  if (loading) {
    return <Spinner text="LOR xizmatlari yuklanmoqda..." />;
  }

  return (
    <div className="space-y-4 overflow-x-hidden sm:space-y-6">
      <div className="card border-sky-200 bg-sky-50/70 p-4 sm:p-5">
        <h1 className="text-xl font-bold text-slate-800">LOR paneli</h1>
        <p className="mt-1 text-sm text-slate-600">Bosqichma-bosqich chek yaratish</p>

        <div className="mt-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
          Tanlangan LOR: {lorIdentity ? lorIdentity.toUpperCase() : "-"}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {STEP_LABELS.map((label, index) => {
            const n = index + 1;
            const active = n === step;
            const done = n < step;

            return (
              <div
                key={label}
                className={`rounded-xl border px-3 py-2 text-center text-xs font-semibold ${
                  active
                    ? "border-primary bg-cyan-50 text-primary"
                    : done
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-white text-slate-500"
                }`}
              >
                {label}
              </div>
            );
          })}
        </div>
      </div>

      {step === 1 ? (
        <div
          className="card border-sky-200 p-4 sm:p-5"
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              goNextFromSpecialist();
            }
          }}
        >
          <h2 className="text-lg font-semibold">1-qadam: Doktor tanlash</h2>
          <p className="mb-4 text-sm text-slate-600">
            Avval chekni qaysi doktor nomidan chiqarishni tanlang. Yangi doktor qo'shish
            uchun chap menyudan "Doktorlarni boshqarish" ga o'ting.
          </p>

          <div className="mt-4">
            <QuickSearchInput
              label="Doktor qidirish"
              placeholder="Masalan: Aziz"
              value={specialistSearch}
              onChange={setSpecialistSearch}
              inputRef={specialistSearchRef}
              items={specialists}
              getItemLabel={(item) => item?.name || ""}
              onPick={(item) => {
                setSelectedSpecialistId(item?._id || "");
                setSpecialistSearch(item?.name || "");
              }}
              emptyText="Mos doktor topilmadi"
            />
          </div>

          {specialists.length ? (
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
                        : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-primary/50"
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

          {!specialists.length ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Hozircha doktor yo'q. Chap menyudan "Doktorlarni boshqarish" bo'limida
              yangi doktor qo'shing.
            </div>
          ) : null}

          <div className="mt-4 flex justify-end">
            <Button
              className="w-full bg-sky-600 hover:bg-sky-700 focus:ring-sky-300 sm:w-auto"
              onClick={goNextFromSpecialist}
            >
              Keyingi: Bemor
            </Button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div
          className="card border-sky-200 p-4 sm:p-5"
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              goNextFromPatient();
            }
          }}
        >
          <h2 className="text-lg font-semibold">2-qadam: Bemor F.I.O</h2>
          <Input
            label="Bemor F.I.O"
            value={patient.fullName}
            placeholder="Masalan: Ali Valiyev"
            inputRef={patientInputRef}
            onChange={(e) => setPatient({ fullName: toTitleCaseName(e.target.value) })}
          />

          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="secondary" className="w-full sm:w-auto" onClick={() => setStep(1)}>
              Orqaga
            </Button>
            <Button
              className="w-full bg-sky-600 hover:bg-sky-700 focus:ring-sky-300 sm:w-auto"
              onClick={goNextFromPatient}
            >
              Keyingi: Xizmatlar
            </Button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div
          className="card border-sky-200 p-4 sm:p-5"
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              goNextFromServices();
            }
          }}
        >
          <h2 className="text-lg font-semibold">3-qadam: Xizmat tanlash</h2>
          <QuickSearchInput
            label="Xizmat qidirish"
            placeholder="Masalan: Burun chayish"
            value={serviceSearch}
            onChange={setServiceSearch}
            inputRef={serviceSearchRef}
            items={sortedServices}
            getItemLabel={(item) => item?.name || ""}
            onPick={(service) => {
              setServiceSearch(service?.name || "");
            }}
            emptyText="Mos xizmat topilmadi"
          />

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {sortedServices.length === 0 ? (
              <div className="md:col-span-2 xl:col-span-3 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">
                Hali xizmat yo'q. Avval "Xizmat qo'shish" bo'limida xizmat yarating.
              </div>
            ) : null}

            {sortedServices.length > 0 && filteredServices.length === 0 ? (
              <div className="md:col-span-2 xl:col-span-3 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">
                Qidiruv bo'yicha xizmat topilmadi.
              </div>
            ) : null}

            {filteredServices.map((service) => {
              const selected = selectedServiceIds.includes(service._id);
              return (
                <button
                  key={service._id}
                  type="button"
                  onClick={() => toggleService(service._id)}
                  className={`rounded-xl border px-3 py-3 text-left transition ${
                    selected
                      ? "border-primary bg-cyan-50"
                      : "border-slate-200 bg-white hover:border-primary/50"
                  }`}
                >
                  <p className="font-semibold text-slate-800">{service.name}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Narx: {service.price ? formatCurrency(service.price) : "-"}
                  </p>
                </button>
              );
            })}
          </div>

          {selectedServiceIds.length > 0 ? (
            <div className="mt-4 space-y-3">
              {selectedServiceIds.map((serviceId) => {
                const service = sortedServices.find((item) => item._id === serviceId);
                return (
                  <div
                    key={serviceId}
                    className="grid gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-[1fr_160px_auto]"
                  >
                    <div>
                      <p className="font-medium text-slate-800">{service?.name}</p>
                      <p className="text-xs text-slate-500">
                        Narx: {service?.price ? formatCurrency(service.price) : "-"}
                      </p>
                    </div>
                    <Input
                      label="Miqdor"
                      type="number"
                      min="1"
                      value={serviceInputs[serviceId]?.quantity || ""}
                      onChange={(e) => updateServiceQuantity(serviceId, e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-fit self-end"
                      onClick={() => toggleService(serviceId)}
                    >
                      Olib tashlash
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : null}

          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="secondary" className="w-full sm:w-auto" onClick={() => setStep(2)}>
              Orqaga
            </Button>
            <Button
              className="w-full bg-sky-600 hover:bg-sky-700 focus:ring-sky-300 sm:w-auto"
              onClick={goNextFromServices}
            >
              Keyingi: Preview
            </Button>
          </div>
        </div>
      ) : null}

      {step === 4 ? (
        <div
          ref={previewRef}
          tabIndex={0}
          className="card border-sky-200 p-4 outline-none sm:p-5"
          onKeyDown={(event) => {
            if (event.key === "Enter" && !submittingCheckout && selectedServiceIds.length > 0) {
              event.preventDefault();
              handleCreateCheckout();
            }
          }}
        >
          <h2 className="text-lg font-semibold">4-qadam: Chek preview</h2>
          <p className="mb-3 text-sm text-slate-600">Enter bosib chek chiqaring.</p>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm">
              Doktor: <span className="font-semibold">{selectedSpecialist?.name || "-"}</span>
            </p>
            <p className="text-sm">
              Bemor: <span className="font-semibold">{patient.fullName || "-"}</span>
            </p>
            <p className="text-sm">
              LOR tanlovi: <span className="font-semibold">{lorIdentity ? lorIdentity.toUpperCase() : "-"}</span>
            </p>

            <div className="mt-3 space-y-1">
              <p className="text-sm font-semibold">Xizmatlar</p>
              {previewServices.length ? (
                previewServices.map((item) => (
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

            <div className="mt-3 border-t border-dashed border-slate-300 pt-2">
              <div className="flex justify-between text-base font-bold">
                <span>Jami</span>
                <span>{formatCurrency(previewTotal)}</span>
              </div>
            </div>
          </div>

          {!selectedServiceIds.length ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Chek chiqarish uchun kamida bitta xizmat tanlanishi kerak.
            </div>
          ) : null}

          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="secondary" className="w-full sm:w-auto" onClick={() => setStep(3)}>
              Orqaga
            </Button>
            <Button
              loading={submittingCheckout}
              disabled={!selectedServiceIds.length}
              className="w-full bg-sky-600 hover:bg-sky-700 focus:ring-sky-300 sm:w-auto"
              onClick={handleCreateCheckout}
            >
              Chek chiqarish (Enter)
            </Button>
          </div>
        </div>
      ) : null}

      <Alert type="success" message={success} />
      <Alert type="error" message={error} />
      <BusyOverlay show={submittingCheckout} text="Chek yaratilmoqda..." />
    </div>
  );
}

export default LorServicesPage;
