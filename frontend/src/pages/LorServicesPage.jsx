import { useEffect, useMemo, useState } from "react";
import serviceService from "../services/serviceService.js";
import usageService from "../services/usageService.js";
import Input from "../components/Input.jsx";
import Button from "../components/Button.jsx";
import Spinner from "../components/Spinner.jsx";
import Alert from "../components/Alert.jsx";
import BusyOverlay from "../components/BusyOverlay.jsx";
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

function LorServicesPage() {
  const { user, lorIdentity } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submittingCheckout, setSubmittingCheckout] = useState(false);
  const [services, setServices] = useState([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState([]);
  const [serviceInputs, setServiceInputs] = useState({});
  const [patient, setPatient] = useState({ fullName: "" });
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const sortedServices = useMemo(
    () =>
      [...services].sort((a, b) =>
        String(a?.name || "").localeCompare(String(b?.name || ""), "uz")
      ),
    [services]
  );

  const loadServices = async () => {
    setLoading(true);
    setError("");
    try {
      const allServices = await serviceService.getAllServices();
      const currentUserId = String(user?.id || user?._id || "");
      setServices(
        allServices.filter(
          (item) =>
            item.type === "lor" &&
            (!item.createdBy?.userId ||
              String(item.createdBy.userId) === currentUserId)
        )
      );
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadServices();
  }, [user?.id, user?._id]);

  useEffect(() => {
    setSelectedServiceIds((prev) =>
      prev.filter((id) => sortedServices.some((item) => item._id === id))
    );
  }, [sortedServices]);

  const resetMessages = () => {
    setSuccess("");
    setError("");
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
        quantity: value
      }
    }));
  };

  const validateQuantity = (quantity) => {
    const parsed = Number(quantity);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error("Miqdor 0 dan katta bo'lishi kerak.");
    }
    return parsed;
  };

  const handleCreateCheckout = async () => {
    if (submittingCheckout) return;
    resetMessages();
    setSubmittingCheckout(true);
    let printTab = null;

    try {
      const normalizedPatient = splitFullName(patient.fullName);
      const firstName = normalizedPatient.firstName.trim();
      const lastName = normalizedPatient.lastName.trim();
      if (!firstName || !lastName) {
        throw new Error("Bemor F.I.O ni to'liq kiriting (ismi va familiyasi).");
      }
      if (!lorIdentity) {
        throw new Error("LOR tanlovi topilmadi. Qayta kirib chiqing.");
      }
      if (selectedServiceIds.length === 0) {
        throw new Error("Kamida bitta xizmat tanlang.");
      }

      const servicesPayload = selectedServiceIds.map((serviceId) => {
        const service = sortedServices.find((item) => item._id === serviceId);
        if (!service) {
          throw new Error("Tanlangan xizmat topilmadi.");
        }
        const quantity = validateQuantity(serviceInputs[serviceId]?.quantity);
        return {
          serviceId,
          quantity
        };
      });

      printTab = openPendingPrintTab();
      const result = await usageService.createLorCheckout({
        services: servicesPayload,
        lorIdentity,
        patient: {
          firstName,
          lastName
        }
      });

      setSuccess("Chek muvaffaqiyatli yaratildi.");
      setPatient({ fullName: "" });
      setSelectedServiceIds([]);
      setServiceInputs({});

      const written = writeCheckToPrintTab(printTab, result.check);
      if (!written) {
        setError("Brauzer yangi oynani blokladi. Oynaga ruxsatni yo'qing.");
      }
    } catch (err) {
      closePrintTab(printTab);
      setError(extractErrorMessage(err));
    } finally {
      setSubmittingCheckout(false);
    }
  };

  if (loading) {
    return <Spinner text="LOR xizmatlari yuklanmoqda..." />;
  }

  return (
    <div className="space-y-6 overflow-x-hidden">
      <div className="card p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-slate-800">1-qadam: Xizmat tanlash</h2>
        <p className="mb-2 text-sm text-slate-500">
          Xizmatlarni tugma orqali tez tanlang.
        </p>
        <p className="mb-4 text-xs font-semibold text-slate-500">
          Tanlangan LOR: {lorIdentity ? lorIdentity.toUpperCase() : "-"}
        </p>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sortedServices.length === 0 ? (
            <div className="md:col-span-2 xl:col-span-3 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">
              Hali xizmat yo'q. Avval "Xizmat qo'shish" bo'limida xizmat yarating.
            </div>
          ) : null}

          {sortedServices.map((service) => {
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
      </div>

      {selectedServiceIds.length > 0 ? (
        <div className="card p-4 sm:p-5">
          <h2 className="text-lg font-semibold text-slate-800">
            2-qadam: Tanlangan xizmatlar miqdori
          </h2>
          <p className="mb-4 text-sm text-slate-500">
            Har bir tanlangan xizmatga miqdor kiriting.
          </p>

          <div className="space-y-3">
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
        </div>
      ) : (
        <div className="card p-4 sm:p-5">
          <p className="text-sm text-slate-600">
            Miqdor bo'limi chiqishi uchun avval xizmat tanlang.
          </p>
        </div>
      )}

      <div className="card p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-slate-800">3-qadam: Bemor ma'lumoti</h2>
        <p className="mb-4 text-sm text-slate-500">
          Bemor F.I.O ni kiriting, keyin chekni bir marta bosib chiqaring.
        </p>

        <div className="mb-4 grid gap-3 md:grid-cols-1">
          <Input
            label="Bemor F.I.O"
            value={patient.fullName}
            placeholder="Masalan: Ali Valiyev"
            onChange={(e) =>
              setPatient((prev) => ({
                ...prev,
                fullName: toTitleCaseName(e.target.value)
              }))
            }
          />
        </div>

        <Button loading={submittingCheckout} onClick={handleCreateCheckout}>
          Tez chek chiqarish
        </Button>
      </div>

      <Alert type="success" message={success} />
      <Alert type="error" message={error} />
      <BusyOverlay show={submittingCheckout} text="Chek yaratilmoqda..." />
    </div>
  );
}

export default LorServicesPage;
