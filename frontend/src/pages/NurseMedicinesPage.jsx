import { useEffect, useMemo, useState } from "react";
import medicineService from "../services/medicineService.js";
import Input from "../components/Input.jsx";
import Button from "../components/Button.jsx";
import Spinner from "../components/Spinner.jsx";
import Alert from "../components/Alert.jsx";
import Table from "../components/Table.jsx";
import ConfirmActionModal from "../components/ConfirmActionModal.jsx";
import {
  extractErrorMessage,
  formatCurrency,
  formatMoneyInput,
  parseMoneyInput,
  toTitleCaseName
} from "../utils/format.js";

function NurseMedicinesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [newMedicineName, setNewMedicineName] = useState("");
  const [newMedicinePrice, setNewMedicinePrice] = useState("");
  const [editingMedicineId, setEditingMedicineId] = useState("");
  const [editForm, setEditForm] = useState({ name: "", price: "" });
  const [medicines, setMedicines] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const nurseMedicines = useMemo(() => medicines, [medicines]);

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
      const safeName = toTitleCaseName(newMedicineName).trim();
      const safePrice = parseMoneyInput(newMedicinePrice);
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
      price: formatMoneyInput(medicine.price)
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
      const safeName = toTitleCaseName(editForm.name).trim();
      const safePrice = parseMoneyInput(editForm.price);

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

  const handleDeleteClick = (medicine) => {
    if (!medicine?._id) return;
    resetMessages();
    setDeleteTarget(medicine);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget?._id) return;
    resetMessages();
    setDeletingId(deleteTarget._id);
    try {
      const result = await medicineService.deleteMedicine(deleteTarget._id);
      if (result?.archived) {
        setSuccess("Dori ishlatilganligi sabab arxivga olindi.");
      } else {
        setSuccess("Dori o'chirildi.");
      }

      if (editingMedicineId === deleteTarget._id) {
        handleCancelEdit();
      }

      setDeleteTarget(null);
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
            onChange={(e) => setNewMedicineName(toTitleCaseName(e.target.value))}
            placeholder="Masalan: Paracetamol"
          />
          <Input
            label="Narxi"
            type="text"
            inputMode="numeric"
            maxLength={7}
            value={newMedicinePrice}
            onChange={(e) => setNewMedicinePrice(formatMoneyInput(e.target.value))}
            placeholder="Masalan: 12 000"
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

      <div className="card p-4">
        <h3 className="mb-4 text-base font-semibold text-slate-800">
          Dorilar ro'yxati
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
        title="Dorini o'chirish"
        description={
          deleteTarget
            ? `${deleteTarget.name} dorisini o'chirmoqchimisiz?`
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

export default NurseMedicinesPage;
