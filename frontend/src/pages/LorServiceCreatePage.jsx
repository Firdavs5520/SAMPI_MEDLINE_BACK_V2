import { useEffect, useState } from "react";
import serviceService from "../services/serviceService.js";
import Input from "../components/Input.jsx";
import Button from "../components/Button.jsx";
import Spinner from "../components/Spinner.jsx";
import Alert from "../components/Alert.jsx";
import Table from "../components/Table.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { extractErrorMessage, formatCurrency } from "../utils/format.js";

function LorServiceCreatePage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [savingService, setSavingService] = useState(false);
  const [services, setServices] = useState([]);
  const [newServiceForm, setNewServiceForm] = useState({ name: "", price: "" });
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

  const handleAddService = async (e) => {
    e.preventDefault();
    setSuccess("");
    setError("");
    setSavingService(true);
    try {
      const safeName = newServiceForm.name.trim();
      const safePrice = Number(newServiceForm.price);

      if (!safeName) {
        throw new Error("Xizmat nomini kiriting.");
      }
      if (!Number.isFinite(safePrice) || safePrice <= 0 || safePrice >= 1000000) {
        throw new Error("Narx > 0 va < 1,000,000 bo'lishi kerak.");
      }

      await serviceService.createService({
        name: safeName,
        type: "lor",
        price: safePrice
      });

      setSuccess("Yangi LOR xizmati qo'shildi.");
      setNewServiceForm({ name: "", price: "" });
      await loadServices();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSavingService(false);
    }
  };

  if (loading) {
    return <Spinner text="LOR xizmatlari yuklanmoqda..." />;
  }

  return (
    <div className="space-y-6 overflow-x-hidden">
      <div className="card p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-slate-800">Xizmat qo'shish</h2>
        <p className="mb-4 text-sm text-slate-500">
          LOR uchun yangi xizmat nomi va narxini kiriting.
        </p>
        <form
          onSubmit={handleAddService}
          className="grid gap-3 md:grid-cols-[1fr_180px_auto]"
        >
          <Input
            label="Xizmat nomi"
            value={newServiceForm.name}
            onChange={(e) =>
              setNewServiceForm((prev) => ({ ...prev, name: e.target.value }))
            }
          />
          <Input
            label="Narxi"
            type="number"
            min="1"
            value={newServiceForm.price}
            onChange={(e) =>
              setNewServiceForm((prev) => ({ ...prev, price: e.target.value }))
            }
          />
          <Button type="submit" className="h-fit self-end" loading={savingService}>
            Qo'shish
          </Button>
        </form>
      </div>

      <Alert type="success" message={success} />
      <Alert type="error" message={error} />

      <div className="card p-4 sm:p-5">
        <h2 className="mb-4 text-lg font-semibold text-slate-800">Mavjud LOR xizmatlari</h2>
        <Table
          data={services}
          columns={[
            { key: "name", label: "Nomi" },
            {
              key: "price",
              label: "Narxi",
              render: (row) => formatCurrency(row.price)
            },
            {
              key: "createdBy",
              label: "Qo'shgan xodim",
              render: (row) => row.createdBy?.name || "-"
            }
          ]}
        />
      </div>
    </div>
  );
}

export default LorServiceCreatePage;
