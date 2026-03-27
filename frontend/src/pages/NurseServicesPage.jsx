import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import serviceService from "../services/serviceService.js";
import Input from "../components/Input.jsx";
import Button from "../components/Button.jsx";
import Spinner from "../components/Spinner.jsx";
import Alert from "../components/Alert.jsx";
import Table from "../components/Table.jsx";
import { extractErrorMessage, formatCurrency } from "../utils/format.js";

function NurseServicesPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [services, setServices] = useState([]);
  const [form, setForm] = useState({ name: "", price: "" });
  const [editingServiceId, setEditingServiceId] = useState("");
  const [editForm, setEditForm] = useState({ name: "", price: "" });
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const nurseServices = useMemo(() => {
    const userId = String(user?.id || user?._id || "");
    return services.filter((item) => {
      if (item.type !== "nurse") return false;
      if (!item.createdBy?.userId) return false;
      return String(item.createdBy.userId) === userId;
    });
  }, [services, user?.id, user?._id]);

  const loadServices = async () => {
    setLoading(true);
    setError("");
    try {
      const allServices = await serviceService.getAllServices();
      setServices(allServices);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadServices();
  }, []);

  const resetMessages = () => {
    setSuccess("");
    setError("");
  };

  const handleAddService = async (e) => {
    e.preventDefault();
    resetMessages();
    setSaving(true);

    try {
      const safeName = form.name.trim();
      const safePrice = Number(form.price);

      if (!safeName) {
        throw new Error("Xizmat nomini kiriting.");
      }
      if (!Number.isFinite(safePrice) || safePrice <= 0 || safePrice >= 1000000) {
        throw new Error("Narx > 0 va < 1,000,000 bo'lishi kerak.");
      }

      await serviceService.createService({
        name: safeName,
        type: "nurse",
        price: safePrice
      });

      setSuccess("Yangi nurse xizmati qo'shildi.");
      setForm({ name: "", price: "" });
      await loadServices();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleStartEdit = (service) => {
    setEditingServiceId(service._id);
    setEditForm({
      name: service.name || "",
      price: service.price ? String(service.price) : ""
    });
    resetMessages();
  };

  const handleCancelEdit = () => {
    setEditingServiceId("");
    setEditForm({ name: "", price: "" });
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingServiceId) return;

    resetMessages();
    setUpdating(true);
    try {
      const safeName = editForm.name.trim();
      const safePrice = Number(editForm.price);

      if (!safeName) {
        throw new Error("Xizmat nomini kiriting.");
      }
      if (!Number.isFinite(safePrice) || safePrice <= 0 || safePrice >= 1000000) {
        throw new Error("Narx > 0 va < 1,000,000 bo'lishi kerak.");
      }

      await serviceService.updateService(editingServiceId, {
        name: safeName,
        price: safePrice
      });

      setSuccess("Xizmat ma'lumoti yangilandi.");
      handleCancelEdit();
      await loadServices();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = async (service) => {
    if (!service?._id) return;

    const confirmed = window.confirm(
      `${service.name} xizmatini o'chirmoqchimisiz? Bu amal qaytarilmaydi.`
    );
    if (!confirmed) return;

    resetMessages();
    setDeletingId(service._id);
    try {
      await serviceService.deleteService(service._id);
      setSuccess("Xizmat o'chirildi.");

      if (editingServiceId === service._id) {
        handleCancelEdit();
      }

      await loadServices();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setDeletingId("");
    }
  };

  if (loading) {
    return <Spinner text="Nurse xizmatlari yuklanmoqda..." />;
  }

  return (
    <div className="space-y-6">
      <div className="card p-4">
        <h2 className="text-lg font-semibold text-slate-800">Xizmat Qoshish</h2>
        <p className="mb-4 text-sm text-slate-500">
          Nurse uchun yangi xizmat va uning narxini kiriting.
        </p>
        <form
          onSubmit={handleAddService}
          className="grid gap-3 md:grid-cols-[1fr_180px_auto]"
        >
          <Input
            label="Xizmat nomi"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
          />
          <Input
            label="Narxi"
            type="number"
            min="1"
            value={form.price}
            onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))}
          />
          <Button type="submit" className="h-fit self-end" loading={saving}>
            Qoshish
          </Button>
        </form>
      </div>

      {editingServiceId ? (
        <div className="card p-4">
          <h3 className="text-base font-semibold text-slate-800">Xizmatni tahrirlash</h3>
          <form
            onSubmit={handleSaveEdit}
            className="mt-3 grid gap-3 md:grid-cols-[1fr_180px_auto_auto]"
          >
            <Input
              label="Xizmat nomi"
              value={editForm.name}
              onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
            />
            <Input
              label="Narxi"
              type="number"
              min="1"
              value={editForm.price}
              onChange={(e) => setEditForm((prev) => ({ ...prev, price: e.target.value }))}
            />
            <Button type="submit" className="h-fit self-end" loading={updating}>
              Saqlash
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="h-fit self-end"
              onClick={handleCancelEdit}
              disabled={updating}
            >
              Bekor qilish
            </Button>
          </form>
        </div>
      ) : null}

      <Alert type="success" message={success} />
      <Alert type="error" message={error} />

      <div className="card p-4">
        <h3 className="mb-4 text-base font-semibold text-slate-800">
          Men qo'shgan nurse xizmatlari
        </h3>
        <Table
          data={nurseServices}
          columns={[
            { key: "name", label: "Xizmat" },
            { key: "type", label: "Turi" },
            {
              key: "price",
              label: "Narxi",
              render: (row) => formatCurrency(row.price)
            },
            {
              key: "actions",
              label: "Amallar",
              render: (row) => (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="px-3 py-1.5 text-xs"
                    onClick={() => handleStartEdit(row)}
                    disabled={deletingId === row._id}
                  >
                    Tahrirlash
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    className="px-3 py-1.5 text-xs"
                    onClick={() => handleDelete(row)}
                    loading={deletingId === row._id}
                  >
                    O'chirish
                  </Button>
                </div>
              )
            }
          ]}
        />
      </div>
    </div>
  );
}

export default NurseServicesPage;
