import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import medicineService from "../services/medicineService.js";
import Input from "../components/Input.jsx";
import Button from "../components/Button.jsx";
import Spinner from "../components/Spinner.jsx";
import Alert from "../components/Alert.jsx";
import Table from "../components/Table.jsx";
import { extractErrorMessage, formatCurrency } from "../utils/format.js";

function NurseMedicinesPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [newMedicineName, setNewMedicineName] = useState("");
  const [newMedicinePrice, setNewMedicinePrice] = useState("");
  const [editingMedicineId, setEditingMedicineId] = useState("");
  const [editForm, setEditForm] = useState({ name: "", price: "" });
  const [medicines, setMedicines] = useState([]);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const nurseMedicines = useMemo(() => {
    const userId = String(user?.id || user?._id || "");
    return medicines.filter((medicine) => {
      if (!medicine.createdBy?.userId) return false;
      return String(medicine.createdBy.userId) === userId;
    });
  }, [medicines, user?.id, user?._id]);

  const loadMedicines = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await medicineService.getAllMedicines();
      setMedicines(data);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMedicines();
  }, []);

  const resetMessages = () => {
    setSuccess("");
    setError("");
  };

  const handleAddMedicine = async (e) => {
    e.preventDefault();
    resetMessages();
    setSaving(true);

    try {
      const safeName = newMedicineName.trim();
      const safePrice = Number(newMedicinePrice);
      if (!safeName) {
        throw new Error("Dori nomini kiriting.");
      }
      if (!Number.isFinite(safePrice) || safePrice <= 0 || safePrice >= 1000000) {
        throw new Error("Narx > 0 va < 1,000,000 bo'lishi kerak.");
      }

      await medicineService.addMedicine({ name: safeName, price: safePrice });
      setSuccess("Yangi dori qo'shildi. Delivery stock olib kelganda yangilanadi.");
      setNewMedicineName("");
      setNewMedicinePrice("");
      await loadMedicines();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleStartEdit = (medicine) => {
    setEditingMedicineId(medicine._id);
    setEditForm({
      name: medicine.name || "",
      price: medicine.price ? String(medicine.price) : ""
    });
    resetMessages();
  };

  const handleCancelEdit = () => {
    setEditingMedicineId("");
    setEditForm({ name: "", price: "" });
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingMedicineId) return;

    resetMessages();
    setUpdating(true);
    try {
      const safeName = editForm.name.trim();
      const safePrice = Number(editForm.price);

      if (!safeName) {
        throw new Error("Dori nomini kiriting.");
      }
      if (!Number.isFinite(safePrice) || safePrice <= 0 || safePrice >= 1000000) {
        throw new Error("Narx > 0 va < 1,000,000 bo'lishi kerak.");
      }

      await medicineService.updateMedicine(editingMedicineId, {
        name: safeName,
        price: safePrice
      });

      setSuccess("Dori ma'lumoti yangilandi.");
      handleCancelEdit();
      await loadMedicines();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = async (medicine) => {
    if (!medicine?._id) return;

    const confirmed = window.confirm(
      `${medicine.name} dorisini o'chirmoqchimisiz? Bu amal qaytarilmaydi.`
    );
    if (!confirmed) return;

    resetMessages();
    setDeletingId(medicine._id);
    try {
      await medicineService.deleteMedicine(medicine._id);
      setSuccess("Dori o'chirildi.");

      if (editingMedicineId === medicine._id) {
        handleCancelEdit();
      }

      await loadMedicines();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setDeletingId("");
    }
  };

  if (loading) {
    return <Spinner text="Nurse dorilari yuklanmoqda..." />;
  }

  return (
    <div className="space-y-6">
      <div className="card p-4">
        <h2 className="text-lg font-semibold text-slate-800">Dori Qoshish</h2>
        <p className="mb-4 text-sm text-slate-500">
          Bu bo'limda nurse yangi dori nomlarini qo'shadi.
        </p>
        <form
          onSubmit={handleAddMedicine}
          className="grid gap-3 md:grid-cols-[1fr_180px_auto]"
        >
          <Input
            label="Dori nomi"
            value={newMedicineName}
            onChange={(e) => setNewMedicineName(e.target.value)}
            placeholder="Masalan: Paracetamol"
          />
          <Input
            label="Narxi"
            type="number"
            min="1"
            value={newMedicinePrice}
            onChange={(e) => setNewMedicinePrice(e.target.value)}
            placeholder="Masalan: 12000"
          />
          <Button type="submit" className="h-fit self-end" loading={saving}>
            Qoshish
          </Button>
        </form>
      </div>

      {editingMedicineId ? (
        <div className="card p-4">
          <h3 className="text-base font-semibold text-slate-800">Dorini tahrirlash</h3>
          <form
            onSubmit={handleSaveEdit}
            className="mt-3 grid gap-3 md:grid-cols-[1fr_180px_auto_auto]"
          >
            <Input
              label="Dori nomi"
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
          Men qo'shgan dorilar
        </h3>
        <Table
          data={nurseMedicines}
          columns={[
            { key: "name", label: "Dori" },
            {
              key: "price",
              label: "Narxi",
              render: (row) => formatCurrency(row.price)
            },
            { key: "stock", label: "Qoldiq" },
            {
              key: "status",
              label: "Holat",
              render: (row) =>
                row.stock <= 0 ? (
                  <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
                    QOLMADI
                  </span>
                ) : (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                    Mavjud
                  </span>
                )
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

export default NurseMedicinesPage;
