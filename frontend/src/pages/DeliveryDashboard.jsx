import { useEffect, useState } from "react";
import medicineService from "../services/medicineService.js";
import Input from "../components/Input.jsx";
import Button from "../components/Button.jsx";
import Alert from "../components/Alert.jsx";
import Table from "../components/Table.jsx";
import Spinner from "../components/Spinner.jsx";
import { extractErrorMessage, formatCurrency } from "../utils/format.js";

const initialStockForm = { medicineId: "", quantity: "" };

function DeliveryDashboard() {
  const [loading, setLoading] = useState(true);
  const [savingStock, setSavingStock] = useState(false);
  const [medicines, setMedicines] = useState([]);
  const [stockForm, setStockForm] = useState(initialStockForm);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const loadMedicines = async () => {
    setLoading(true);
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

  const handleRestock = async (e) => {
    e.preventDefault();
    resetMessages();
    setSavingStock(true);
    try {
      if (!stockForm.medicineId) {
        throw new Error("Medicine tanlang.");
      }

      const quantity = Number(stockForm.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error("Miqdor 0 dan katta bo'lishi kerak.");
      }

      await medicineService.increaseStock(stockForm.medicineId, quantity);

      setSuccess("Stock muvaffaqiyatli oshirildi.");
      setStockForm(initialStockForm);
      await loadMedicines();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSavingStock(false);
    }
  };

  if (loading) {
    return <Spinner text="Delivery panel yuklanmoqda..." />;
  }

  return (
    <div className="space-y-6">
      <div className="card p-4">
        <h2 className="text-lg font-semibold text-slate-800">Stock Olib Kelish</h2>
        <p className="mb-4 text-sm text-slate-500">
          Delivery yangi dori nomi qo'shmaydi, faqat nurse qo'shgan dorilarni
          miqdor bilan to'ldiradi.
        </p>
        <form
          onSubmit={handleRestock}
          className="grid gap-3 md:grid-cols-[1fr_180px_auto]"
        >
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-600">
              Medicine
            </span>
            <select
              value={stockForm.medicineId}
              onChange={(e) =>
                setStockForm((prev) => ({ ...prev, medicineId: e.target.value }))
              }
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10"
            >
              <option value="">Tanlang</option>
              {medicines.map((medicine) => (
                <option key={medicine._id} value={medicine._id}>
                  {medicine.name} (qoldiq: {medicine.stock})
                </option>
              ))}
            </select>
          </label>

          <Input
            label="Keltirilgan miqdor"
            type="number"
            min="1"
            value={stockForm.quantity}
            onChange={(e) =>
              setStockForm((prev) => ({ ...prev, quantity: e.target.value }))
            }
          />

          <Button type="submit" className="h-fit self-end" loading={savingStock}>
            Qoldiqni oshirish
          </Button>
        </form>
      </div>

      <Alert type="success" message={success} />
      <Alert type="error" message={error} />

      <div className="card p-4">
        <h2 className="mb-4 text-lg font-semibold text-slate-800">Medicine Table</h2>
        <Table
          data={medicines}
          columns={[
            { key: "name", label: "Nomi" },
            {
              key: "price",
              label: "Narxi",
              render: (row) => formatCurrency(row.price)
            },
            {
              key: "createdBy",
              label: "Qo'shgan Nurse",
              render: (row) => row.createdBy?.name || "-"
            },
            { key: "stock", label: "Qoldiq" },
            { key: "createdAt", label: "Yaratilgan" }
          ]}
        />
      </div>
    </div>
  );
}

export default DeliveryDashboard;
