import { useEffect, useMemo, useState } from "react";
import serviceService from "../services/serviceService.js";
import Input from "../components/Input.jsx";
import Button from "../components/Button.jsx";
import Spinner from "../components/Spinner.jsx";
import Alert from "../components/Alert.jsx";
import Table from "../components/Table.jsx";
import ConfirmActionModal from "../components/ConfirmActionModal.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import {
  extractErrorMessage,
  formatCurrency,
  formatMoneyInput,
  parseMoneyInput,
  toTitleCaseName
} from "../utils/format.js";

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
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const currentUserId = String(user?.id || user?._id || "");

  const lorServices = useMemo(() => {
    return services.filter((item) => {
      if (item.type !== "lor") return false;
      return true;
    });
  }, [services]);

  const canManageService = (service) =>
    !!service?.createdBy?.userId &&
    String(service.createdBy.userId) === currentUserId;

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
      const safeName = toTitleCaseName(newServiceForm.name).trim();
      const safePrice = parseMoneyInput(newServiceForm.price);

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
    if (!canManageService(service)) {
      setError("Faqat o'zingiz qo'shgan xizmatni tahrirlashingiz mumkin.");
      return;
    }

    setEditingServiceId(service._id);
    setEditForm({
      name: service.name || "",
      price: formatMoneyInput(service.price)
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
      const safeName = toTitleCaseName(editForm.name).trim();
      const safePrice = parseMoneyInput(editForm.price);

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

  const handleDeleteClick = (service) => {
    if (!service?._id) return;
    if (!canManageService(service)) {
      setError("Faqat o'zingiz qo'shgan xizmatni o'chirishingiz mumkin.");
      return;
    }
    resetMessages();
    setDeleteTarget(service);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget?._id) return;
    resetMessages();
    setDeletingId(deleteTarget._id);
    try {
      await serviceService.deleteService(deleteTarget._id);
      setSuccess("Xizmat o'chirildi.");

      if (editingServiceId === deleteTarget._id) {
        handleCancelEdit();
      }

      setDeleteTarget(null);
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
              setNewServiceForm((prev) => ({
                ...prev,
                name: toTitleCaseName(e.target.value)
              }))
            }
          />
          <Input
            label="Narxi"
            type="text"
            inputMode="numeric"
            maxLength={7}
            value={newServiceForm.price}
            onChange={(e) =>
              setNewServiceForm((prev) => ({
                ...prev,
                price: formatMoneyInput(e.target.value)
              }))
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
              onChange={(e) =>
                setEditForm((prev) => ({
                  ...prev,
                  name: toTitleCaseName(e.target.value)
                }))
              }
            />
            <Input
              label="Narxi"
              type="text"
              inputMode="numeric"
              maxLength={7}
              value={editForm.price}
              onChange={(e) =>
                setEditForm((prev) => ({
                  ...prev,
                  price: formatMoneyInput(e.target.value)
                }))
              }
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
          LOR xizmatlari ro'yxati
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
              key: "actions",
              label: "Amallar",
              render: (row) => (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="px-3 py-1.5 text-xs"
                    onClick={() => handleStartEdit(row)}
                    disabled={deletingId === row._id || !canManageService(row)}
                  >
                    Tahrirlash
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    className="px-3 py-1.5 text-xs"
                    onClick={() => handleDeleteClick(row)}
                    loading={deletingId === row._id}
                    disabled={!canManageService(row)}
                  >
                    O'chirish
                  </Button>
                </div>
              )
            }
          ]}
        />
      </div>

      <ConfirmActionModal
        open={Boolean(deleteTarget)}
        title="Xizmatni o'chirish"
        description={
          deleteTarget
            ? `${deleteTarget.name} xizmatini o'chirmoqchimisiz?`
            : ""
        }
        confirmText="Ha, o'chirish"
        cancelText="Yo'q"
        loading={Boolean(deleteTarget?._id) && deletingId === deleteTarget._id}
        onConfirm={handleDeleteConfirm}
        onClose={() => {
          if (!deletingId) setDeleteTarget(null);
        }}
      />
    </div>
  );
}

export default LorServiceCreatePage;
