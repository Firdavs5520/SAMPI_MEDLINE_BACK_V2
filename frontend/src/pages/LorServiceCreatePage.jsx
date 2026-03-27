import { useEffect, useMemo, useState } from "react";
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
  const [updating, setUpdating] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [services, setServices] = useState([]);
  const [newServiceForm, setNewServiceForm] = useState({ name: "", price: "" });
  const [editingServiceId, setEditingServiceId] = useState("");
  const [editForm, setEditForm] = useState({ name: "", price: "" });
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const lorServices = useMemo(() => {
    const currentUserId = String(user?.id || user?._id || "");
    return services.filter((item) => {
      if (item.type !== "lor") return false;
      if (!item.createdBy?.userId) return false;
      return String(item.createdBy.userId) === currentUserId;
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
  }, [user?.id, user?._id]);

  const resetMessages = () => {
    setSuccess("");
    setError("");
  };

  const handleAddService = async (e) => {
    e.preventDefault();
    resetMessages();
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

      {editingServiceId ? (
        <div className="card p-4 sm:p-5">
          <h2 className="text-lg font-semibold text-slate-800">Xizmatni tahrirlash</h2>
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

      <div className="card p-4 sm:p-5">
        <h2 className="mb-4 text-lg font-semibold text-slate-800">
          Men qo'shgan LOR xizmatlari
        </h2>
        <Table
          data={lorServices}
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

export default LorServiceCreatePage;
