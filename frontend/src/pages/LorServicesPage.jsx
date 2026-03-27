import { useEffect, useState } from "react";
import serviceService from "../services/serviceService.js";
import usageService from "../services/usageService.js";
import Input from "../components/Input.jsx";
import Button from "../components/Button.jsx";
import Spinner from "../components/Spinner.jsx";
import Alert from "../components/Alert.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { extractErrorMessage, formatCurrency } from "../utils/format.js";
import {
  closePrintTab,
  openPendingPrintTab,
  writeCheckToPrintTab
} from "../utils/printReceipt.js";

function LorServicesPage() {
  const { user, lorIdentity } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState(null);
  const [services, setServices] = useState([]);
  const [serviceForms, setServiceForms] = useState({});
  const [patient, setPatient] = useState({ firstName: "", lastName: "" });
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

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

  const validate = (quantity) => {
    const q = Number(quantity);

    if (!q) {
      throw new Error("Miqdor kiritilishi shart.");
    }
    if (q <= 0) {
      throw new Error("Miqdor 0 dan katta bo'lishi kerak.");
    }

    return { q };
  };

  const updateForm = (serviceId, value) => {
    setServiceForms((prev) => ({
      ...prev,
      [serviceId]: {
        ...prev[serviceId],
        quantity: value
      }
    }));
  };

  const handleUseService = async (serviceId) => {
    setSuccess("");
    setError("");
    setSubmittingId(serviceId);
    const printTab = openPendingPrintTab();

    try {
      const firstName = patient.firstName.trim();
      const lastName = patient.lastName.trim();
      if (!firstName || !lastName) {
        throw new Error("Bemor ismi va familiyasini kiriting.");
      }
      if (!lorIdentity) {
        throw new Error("Avval LOR tanlash bo'limidan LOR 1 yoki LOR 2 ni tanlang.");
      }

      const form = serviceForms[serviceId] || {};
      const { q } = validate(form.quantity);

      const result = await usageService.useService({
        serviceId,
        quantity: q,
        lorIdentity,
        patient: {
          firstName,
          lastName
        }
      });

      setSuccess("Xizmat muvaffaqiyatli ishlatildi.");
      setServiceForms((prev) => ({
        ...prev,
        [serviceId]: { quantity: "" }
      }));
      setPatient({ firstName: "", lastName: "" });

      const written = writeCheckToPrintTab(printTab, result.check);
      if (!written) {
        setError("Brauzer yangi tabni blokladi. Pop-up ruxsatini yoqing.");
      }
    } catch (err) {
      closePrintTab(printTab);
      setError(extractErrorMessage(err));
    } finally {
      setSubmittingId(null);
    }
  };

  if (loading) {
    return <Spinner text="LOR xizmatlari yuklanmoqda..." />;
  }

  return (
    <div className="space-y-6 overflow-x-hidden">
      <div className="card p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-slate-800">Xizmatdan foydalanish</h2>
        <p className="mb-4 text-sm text-slate-500">
          Faqat o'zingiz qo'shgan xizmatlar chiqadi. Narx avtomatik olinadi.
        </p>
        <p className="mb-4 text-xs font-semibold text-slate-500">
          Tanlangan LOR: {lorIdentity ? lorIdentity.toUpperCase() : "-"}
        </p>

        <div className="mb-4 grid gap-3 md:grid-cols-2">
          <Input
            label="Bemor ismi"
            value={patient.firstName}
            onChange={(e) =>
              setPatient((prev) => ({ ...prev, firstName: e.target.value }))
            }
          />
          <Input
            label="Bemor familiyasi"
            value={patient.lastName}
            onChange={(e) =>
              setPatient((prev) => ({ ...prev, lastName: e.target.value }))
            }
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {services.length === 0 ? (
            <div className="md:col-span-2 xl:col-span-3 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">
              Hali o'zingiz qo'shgan xizmat yo'q. Avval "Xizmat qo'shish" bo'limida xizmat yarating.
            </div>
          ) : null}
          {services.map((service) => {
            const form = serviceForms[service._id] || { quantity: "" };
            return (
              <div key={service._id} className="rounded-xl border border-slate-200 p-3">
                <h3 className="font-semibold text-slate-800">{service.name}</h3>
                <p className="mb-3 text-xs text-slate-500">
                  Bazaviy narx: {service.price ? formatCurrency(service.price) : "-"}
                </p>
                <div className="space-y-2">
                  <Input
                    label="Miqdor"
                    type="number"
                    min="1"
                    value={form.quantity}
                    onChange={(e) => updateForm(service._id, e.target.value)}
                  />
                  <Button
                    className="w-full"
                    loading={submittingId === service._id}
                    onClick={() => handleUseService(service._id)}
                  >
                    Xizmatni ishlatish
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Alert type="success" message={success} />
      <Alert type="error" message={error} />
    </div>
  );
}

export default LorServicesPage;
