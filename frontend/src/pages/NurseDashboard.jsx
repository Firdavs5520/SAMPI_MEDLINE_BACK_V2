import { useEffect, useMemo, useState } from "react";
import medicineService from "../services/medicineService.js";
import serviceService from "../services/serviceService.js";
import usageService from "../services/usageService.js";
import Input from "../components/Input.jsx";
import Button from "../components/Button.jsx";
import Spinner from "../components/Spinner.jsx";
import Alert from "../components/Alert.jsx";
import BusyOverlay from "../components/BusyOverlay.jsx";
import { extractErrorMessage, formatCurrency } from "../utils/format.js";
import {
  closePrintTab,
  openPendingPrintTab,
  writeCheckToPrintTab
} from "../utils/printReceipt.js";

const defaultPatient = { firstName: "", lastName: "" };
const priceTierLabels = {
  first: "1-marta",
  second: "2-marta",
  third: "3-marta"
};
const priceTierOrder = ["first", "second", "third"];

const isValidStoredPrice = (value) => {
  const price = Number(value);
  return Number.isFinite(price) && price > 0 && price < 1000000;
};

const getServiceTierPrices = (service) => {
  const first = Number(service?.priceOptions?.first);
  const second = Number(service?.priceOptions?.second);
  const third = Number(service?.priceOptions?.third);

  if (
    isValidStoredPrice(first) &&
    isValidStoredPrice(second) &&
    isValidStoredPrice(third)
  ) {
    return { first, second, third, hasTierPrices: true };
  }

  const base = Number(service?.price);
  if (isValidStoredPrice(base)) {
    return {
      first: base,
      second: base,
      third: base,
      hasTierPrices: false
    };
  }

  return null;
};

const getSelectedServicePrice = (service, priceTier) => {
  const prices = getServiceTierPrices(service);
  if (!prices) return null;
  const safeTier = priceTierOrder.includes(priceTier) ? priceTier : "first";
  return prices[safeTier];
};

function NurseDashboard() {
  const [loading, setLoading] = useState(true);
  const [submittingCheckout, setSubmittingCheckout] = useState(false);
  const [medicines, setMedicines] = useState([]);
  const [nurseServices, setNurseServices] = useState([]);
  const [patient, setPatient] = useState(defaultPatient);
  const [selectedMedicineIds, setSelectedMedicineIds] = useState([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState([]);
  const [medicineInputs, setMedicineInputs] = useState({});
  const [serviceInputs, setServiceInputs] = useState({});
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const nurseMedicines = useMemo(() => medicines, [medicines]);

  const hasAnySelection = selectedMedicineIds.length > 0 || selectedServiceIds.length > 0;

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [medicineData, serviceData] = await Promise.all([
        medicineService.getAllMedicines(),
        serviceService.getAllServices()
      ]);
      setMedicines(medicineData);
      setNurseServices(serviceData.filter((item) => item.type === "nurse"));
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
    setSelectedMedicineIds((prev) =>
      prev.filter((id) =>
        nurseMedicines.some(
          (item) => item._id === id && item.stock > 0 && isValidStoredPrice(item.price)
        )
      )
    );

    setMedicineInputs((prev) => {
      const next = {};
      Object.keys(prev).forEach((key) => {
        if (nurseMedicines.some((item) => item._id === key)) {
          next[key] = prev[key];
        }
      });
      return next;
    });
  }, [nurseMedicines]);

  useEffect(() => {
    setSelectedServiceIds((prev) =>
      prev.filter((id) =>
        nurseServices.some((item) => item._id === id && !!getServiceTierPrices(item))
      )
    );
  }, [nurseServices]);

  const resetMessages = () => {
    setSuccess("");
    setError("");
  };

  const toggleMedicine = (medicineId, canUse) => {
    if (!canUse) return;
    setSelectedMedicineIds((prev) => {
      const exists = prev.includes(medicineId);
      if (exists) {
        return prev.filter((id) => id !== medicineId);
      }

      setMedicineInputs((prevInputs) => ({
        ...prevInputs,
        [medicineId]: {
          quantity: prevInputs[medicineId]?.quantity || "1"
        }
      }));

      return [...prev, medicineId];
    });
  };

  const toggleService = (serviceId, canUse = true) => {
    if (!canUse) return;

    setSelectedServiceIds((prev) => {
      const exists = prev.includes(serviceId);
      if (exists) {
        return prev.filter((id) => id !== serviceId);
      }

      setServiceInputs((prevInputs) => ({
        ...prevInputs,
        [serviceId]: {
          quantity: prevInputs[serviceId]?.quantity || "1",
          priceTier: prevInputs[serviceId]?.priceTier || "first"
        }
      }));

      return [...prev, serviceId];
    });
  };

  const updateMedicineInput = (medicineId, value) => {
    setMedicineInputs((prev) => ({
      ...prev,
      [medicineId]: {
        quantity: value
      }
    }));
  };

  const updateServiceInput = (serviceId, patch) => {
    setServiceInputs((prev) => ({
      ...prev,
      [serviceId]: {
        quantity: prev[serviceId]?.quantity || "1",
        priceTier: prev[serviceId]?.priceTier || "first",
        ...patch
      }
    }));
  };

  const validateQuantity = (quantity) => {
    const parsedQuantity = Number(quantity);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      throw new Error("Miqdor 0 dan katta bo'lishi kerak.");
    }
    return parsedQuantity;
  };

  const handleCreateCheckout = async () => {
    if (submittingCheckout) return;
    resetMessages();
    setSubmittingCheckout(true);
    let printTab = null;

    try {
      const firstName = patient.firstName.trim();
      const lastName = patient.lastName.trim();

      if (!firstName || !lastName) {
        throw new Error("Bemorning ismi va familiyasi kiritilishi shart.");
      }

      if (!hasAnySelection) {
        throw new Error("Kamida bitta dori yoki xizmat tanlang.");
      }

      const medicinePayload = selectedMedicineIds.map((medicineId) => {
        const input = medicineInputs[medicineId] || {};
        const medicine = nurseMedicines.find((item) => item._id === medicineId);
        if (!medicine) {
          throw new Error("Tanlangan dori topilmadi.");
        }
        if (!isValidStoredPrice(medicine.price)) {
          throw new Error(`${medicine.name} uchun narx sozlanmagan.`);
        }

        const quantity = validateQuantity(input.quantity);
        if (medicine.stock < quantity) {
          throw new Error(`${medicine.name} uchun omborda yetarli qoldiq yo'q.`);
        }

        return {
          medicineId,
          quantity
        };
      });

      const servicePayload = selectedServiceIds.map((serviceId) => {
        const input = serviceInputs[serviceId] || {};
        const service = nurseServices.find((item) => item._id === serviceId);
        if (!service) {
          throw new Error("Tanlangan xizmat topilmadi.");
        }

        const quantity = validateQuantity(input.quantity);
        const priceTier = priceTierOrder.includes(input.priceTier)
          ? input.priceTier
          : "first";
        const selectedPrice = getSelectedServicePrice(service, priceTier);
        if (!isValidStoredPrice(selectedPrice)) {
          throw new Error(`${service.name} uchun narx sozlanmagan.`);
        }

        return {
          serviceId,
          quantity,
          priceTier
        };
      });

      printTab = openPendingPrintTab();
      const result = await usageService.createCheckout({
        patient: {
          firstName,
          lastName
        },
        medicines: medicinePayload,
        services: servicePayload
      });

      const written = writeCheckToPrintTab(printTab, result.check);
      if (!written) {
        setError("Brauzer yangi oynani blokladi. Oynaga ruxsatni yo'qing.");
      }

      setSuccess("Chek muvaffaqiyatli yaratildi.");
      setPatient(defaultPatient);
      setSelectedMedicineIds([]);
      setSelectedServiceIds([]);
      setMedicineInputs({});
      setServiceInputs({});
      void loadData();
    } catch (err) {
      closePrintTab(printTab);
      setError(extractErrorMessage(err));
    } finally {
      setSubmittingCheckout(false);
    }
  };

  if (loading) {
    return <Spinner text="Hamshira paneli yuklanmoqda..." />;
  }

  return (
    <div className="space-y-6">
      <div className="card p-4">
        <h2 className="text-lg font-semibold text-slate-800">1-qadam: Dorilarni tanlang</h2>
        <p className="mb-4 text-sm text-slate-500">
          Kerakli dorilarni belgilang. Omborda bo'lmasa "QOLMADI" holatda chiqadi.
        </p>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {nurseMedicines.map((medicine) => {
            const selected = selectedMedicineIds.includes(medicine._id);
            const isOut = medicine.stock <= 0;
            const hasInvalidPrice = !isValidStoredPrice(medicine.price);
            const isBlocked = isOut || hasInvalidPrice;

            return (
              <button
                key={medicine._id}
                type="button"
                disabled={isBlocked}
                onClick={() => toggleMedicine(medicine._id, !isBlocked)}
                className={`rounded-xl border px-3 py-3 text-left transition ${
                  isBlocked
                    ? hasInvalidPrice
                      ? "cursor-not-allowed border-amber-300 bg-amber-50"
                      : "cursor-not-allowed border-rose-300 bg-rose-50"
                    : selected
                      ? "border-primary bg-cyan-50"
                      : "border-slate-200 bg-white hover:border-primary/50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-slate-800">{medicine.name}</p>
                  {isOut ? (
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
                      QOLMADI
                    </span>
                  ) : hasInvalidPrice ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                      NARX YO'Q
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                      Bor
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-600">Qoldiq: {medicine.stock}</p>
                <p className="text-xs text-slate-500">
                  Narx: {medicine.price ? formatCurrency(medicine.price) : "-"}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {selectedMedicineIds.length > 0 ? (
        <div className="card p-4">
          <h3 className="text-base font-semibold text-slate-800">Tanlangan dorilar</h3>
          <div className="mt-3 space-y-3">
            {selectedMedicineIds.map((medicineId) => {
              const medicine = nurseMedicines.find((item) => item._id === medicineId);
              const input = medicineInputs[medicineId] || {};

              return (
                <div
                  key={medicineId}
                  className="grid gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-[1fr_180px_auto]"
                >
                  <div>
                    <p className="font-medium text-slate-800">{medicine?.name}</p>
                    <p className="text-xs text-slate-500">Qoldiq: {medicine?.stock}</p>
                    <p className="text-xs text-slate-500">
                      Narx: {medicine?.price ? formatCurrency(medicine.price) : "-"}
                    </p>
                  </div>
                  <Input
                    label="Miqdor"
                    type="number"
                    min="1"
                    value={input.quantity || ""}
                    onChange={(e) => updateMedicineInput(medicineId, e.target.value)}
                  />
                  <Button
                    variant="secondary"
                    className="h-fit self-end"
                    onClick={() => toggleMedicine(medicineId, true)}
                  >
                    Olib tashlash
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="card p-4">
        <h2 className="text-lg font-semibold text-slate-800">2-qadam: Xizmatlarni tanlang</h2>
        <p className="mb-4 text-sm text-slate-500">
          Hamshira xizmatlari 1/2/3-marta narxlari bilan chiqadi.
        </p>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {nurseServices.map((service) => {
            const selected = selectedServiceIds.includes(service._id);
            const tierPrices = getServiceTierPrices(service);
            const hasInvalidPrice = !tierPrices;
            return (
              <button
                key={service._id}
                type="button"
                disabled={hasInvalidPrice}
                onClick={() => toggleService(service._id, !hasInvalidPrice)}
                className={`rounded-xl border px-3 py-3 text-left transition ${
                  hasInvalidPrice
                    ? "cursor-not-allowed border-amber-300 bg-amber-50"
                    : selected
                      ? "border-primary bg-cyan-50"
                      : "border-slate-200 bg-white hover:border-primary/50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-slate-800">{service.name}</p>
                  {hasInvalidPrice ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                      NARX YO'Q
                    </span>
                  ) : null}
                </div>
                {tierPrices ? (
                  <div className="mt-2 space-y-1 text-xs text-slate-500">
                    <p>1-marta: {formatCurrency(tierPrices.first)}</p>
                    <p>2-marta: {formatCurrency(tierPrices.second)}</p>
                    <p>3-marta: {formatCurrency(tierPrices.third)}</p>
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {selectedServiceIds.length > 0 ? (
        <div className="card p-4">
          <h3 className="text-base font-semibold text-slate-800">Tanlangan xizmatlar</h3>
          <div className="mt-3 space-y-3">
            {selectedServiceIds.map((serviceId) => {
              const service = nurseServices.find((item) => item._id === serviceId);
              const input = serviceInputs[serviceId] || {};
              const priceTier = priceTierOrder.includes(input.priceTier)
                ? input.priceTier
                : "first";
              const selectedPrice = getSelectedServicePrice(service, priceTier);

              return (
                <div
                  key={serviceId}
                  className="grid gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-[1fr_160px_180px_auto]"
                >
                  <div>
                    <p className="font-medium text-slate-800">{service?.name}</p>
                    <p className="text-xs text-slate-500">
                      Tanlangan narx: {selectedPrice ? formatCurrency(selectedPrice) : "-"}
                    </p>
                  </div>
                  <Input
                    label="Miqdor"
                    type="number"
                    min="1"
                    value={input.quantity || ""}
                    onChange={(e) =>
                      updateServiceInput(serviceId, { quantity: e.target.value })
                    }
                  />
                  <div className="space-y-1">
                    <label className="block text-sm font-medium text-slate-700">
                      Narx turi
                    </label>
                    <select
                      value={priceTier}
                      onChange={(e) =>
                        updateServiceInput(serviceId, { priceTier: e.target.value })
                      }
                      className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/20"
                    >
                      {priceTierOrder.map((tierKey) => (
                        <option key={tierKey} value={tierKey}>
                          {priceTierLabels[tierKey]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button
                    variant="secondary"
                    className="h-fit self-end"
                    onClick={() => toggleService(serviceId, true)}
                  >
                    Olib tashlash
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {hasAnySelection ? (
        <div className="card p-4">
          <h2 className="text-lg font-semibold text-slate-800">
            3-qadam: Bemor ma'lumotini kiriting
          </h2>
          <p className="mb-4 text-sm text-slate-500">
            Ism va familiyani kiriting, so'ng chek chiqaring.
          </p>

          <div className="grid gap-3 md:grid-cols-2">
            <Input
              label="Ism"
              value={patient.firstName}
              onChange={(e) =>
                setPatient((prev) => ({ ...prev, firstName: e.target.value }))
              }
            />
            <Input
              label="Familiya"
              value={patient.lastName}
              onChange={(e) =>
                setPatient((prev) => ({ ...prev, lastName: e.target.value }))
              }
            />
          </div>

          <div className="mt-4 flex justify-end">
            <Button loading={submittingCheckout} onClick={handleCreateCheckout}>
              Chek chiqarish
            </Button>
          </div>
        </div>
      ) : (
        <div className="card p-4">
          <p className="text-sm text-slate-600">
            Pastdagi bemor ma'lumot bo'limi chiqishi uchun avval dori yoki xizmat tanlang.
          </p>
        </div>
      )}

      <Alert type="success" message={success} />
      <Alert type="error" message={error} />
      <BusyOverlay show={submittingCheckout} text="Chek yaratilmoqda..." />
    </div>
  );
}

export default NurseDashboard;
