import { useEffect, useMemo, useState } from "react";
import serviceService from "../services/serviceService.js";
import Input from "../components/Input.jsx";
import Button from "../components/Button.jsx";
import Spinner from "../components/Spinner.jsx";
import Alert from "../components/Alert.jsx";
import Table from "../components/Table.jsx";
import ConfirmActionModal from "../components/ConfirmActionModal.jsx";
import { extractErrorMessage, formatCurrency } from "../utils/format.js";

const emptyPriceForm = {
  name: "",
  first: "",
  second: "",
  third: ""
};

const parsePrice = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= 1000000) {
    throw new Error("Narx > 0 va < 1,000,000 bo'lishi kerak.");
  }
  return parsed;
};

const normalizePriceOptions = (form) => ({
  first: parsePrice(form.first),
  second: parsePrice(form.second),
  third: parsePrice(form.third)
});

const getServicePriceOptions = (service) => {
  if (service?.priceOptions?.first && service?.priceOptions?.second && service?.priceOptions?.third) {
    return {
      first: service.priceOptions.first,
      second: service.priceOptions.second,
      third: service.priceOptions.third
    };
  }

  const fallback = Number(service?.price || 0);
  return {
    first: fallback,
    second: fallback,
    third: fallback
  };
};

function NurseServicesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [services, setServices] = useState([]);
  const [form, setForm] = useState(emptyPriceForm);
  const [editingServiceId, setEditingServiceId] = useState("");
  const [editForm, setEditForm] = useState(emptyPriceForm);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const nurseServices = useMemo(
    () => services.filter((item) => item.type === "nurse"),
    [services]
  );

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
      if (!safeName) {
        throw new Error("Xizmat nomini kiriting.");
      }

      const priceOptions = normalizePriceOptions(form);

      await serviceService.createService({
        name: safeName,
        type: "nurse",
        priceOptions
      });

      setSuccess("Yangi hamshira xizmati qo'shildi.");
      setForm(emptyPriceForm);
      await loadServices();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleStartEdit = (service) => {
    const options = getServicePriceOptions(service);

    setEditingServiceId(service._id);
    setEditForm({
      name: service.name || "",
      first: String(options.first || ""),
      second: String(options.second || ""),
      third: String(options.third || "")
    });
    resetMessages();
  };

  const handleCancelEdit = () => {
    setEditingServiceId("");
    setEditForm(emptyPriceForm);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingServiceId) return;

    resetMessages();
    setUpdating(true);
    try {
      const safeName = editForm.name.trim();
      if (!safeName) {
        throw new Error("Xizmat nomini kiriting.");
      }

      const priceOptions = normalizePriceOptions(editForm);

      await serviceService.updateService(editingServiceId, {
        name: safeName,
        priceOptions
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
    return <Spinner text="Hamshira xizmatlari yuklanmoqda..." />;
  }

  return (
    <div className="space-y-6">
      <div className="card p-4">
        <h2 className="text-lg font-semibold text-slate-800">Xizmat Qo'shish</h2>
        <p className="mb-4 text-sm text-slate-500">
          Xizmat nomini va 1/2/3-marta narxlarini kiriting.
        </p>
        <form onSubmit={handleAddService} className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Input
            label="Xizmat nomi"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
          />
          <Input
            label="1-marta narxi"
            type="number"
            min="1"
            value={form.first}
            onChange={(e) => setForm((prev) => ({ ...prev, first: e.target.value }))}
          />
          <Input
            label="2-marta narxi"
            type="number"
            min="1"
            value={form.second}
            onChange={(e) => setForm((prev) => ({ ...prev, second: e.target.value }))}
          />
          <Input
            label="3-marta narxi"
            type="number"
            min="1"
            value={form.third}
            onChange={(e) => setForm((prev) => ({ ...prev, third: e.target.value }))}
          />
          <Button type="submit" className="h-fit self-end" loading={saving}>
            Qo'shish
          </Button>
        </form>
      </div>

      {editingServiceId ? (
        <div className="card p-4">
          <h3 className="text-base font-semibold text-slate-800">Xizmatni tahrirlash</h3>
          <form
            onSubmit={handleSaveEdit}
            className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-6"
          >
            <Input
              label="Xizmat nomi"
              value={editForm.name}
              onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
            />
            <Input
              label="1-marta narxi"
              type="number"
              min="1"
              value={editForm.first}
              onChange={(e) => setEditForm((prev) => ({ ...prev, first: e.target.value }))}
            />
            <Input
              label="2-marta narxi"
              type="number"
              min="1"
              value={editForm.second}
              onChange={(e) => setEditForm((prev) => ({ ...prev, second: e.target.value }))}
            />
            <Input
              label="3-marta narxi"
              type="number"
              min="1"
              value={editForm.third}
              onChange={(e) => setEditForm((prev) => ({ ...prev, third: e.target.value }))}
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
          Hamshira xizmatlari ro'yxati
        </h3>
        <Table
          data={nurseServices}
          columns={[
            { key: "name", label: "Xizmat" },
            {
              key: "firstPrice",
              label: "1-marta",
              render: (row) => formatCurrency(getServicePriceOptions(row).first)
            },
            {
              key: "secondPrice",
              label: "2-marta",
              render: (row) => formatCurrency(getServicePriceOptions(row).second)
            },
            {
              key: "thirdPrice",
              label: "3-marta",
              render: (row) => formatCurrency(getServicePriceOptions(row).third)
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
                    onClick={() => handleDeleteClick(row)}
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

export default NurseServicesPage;
