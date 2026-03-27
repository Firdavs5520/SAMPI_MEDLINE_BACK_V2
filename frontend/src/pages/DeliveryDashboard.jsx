import { useEffect, useState } from "react";
import medicineService from "../services/medicineService.js";
import Input from "../components/Input.jsx";
import Button from "../components/Button.jsx";
import Alert from "../components/Alert.jsx";
import Table from "../components/Table.jsx";
import Spinner from "../components/Spinner.jsx";
import { extractErrorMessage, formatCurrency } from "../utils/format.js";

const createEmptyRow = () => ({
  medicineId: "",
  quantity: ""
});

function DeliveryDashboard() {
  const [loading, setLoading] = useState(true);
  const [savingStock, setSavingStock] = useState(false);
  const [medicines, setMedicines] = useState([]);
  const [stockRows, setStockRows] = useState([createEmptyRow()]);
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

  const addRow = () => {
    setStockRows((prev) => [...prev, createEmptyRow()]);
  };

  const removeRow = (rowIndex) => {
    setStockRows((prev) => {
      const next = prev.filter((_, index) => index !== rowIndex);
      return next.length === 0 ? [createEmptyRow()] : next;
    });
  };

  const updateRow = (rowIndex, key, value) => {
    setStockRows((prev) =>
      prev.map((row, index) =>
        index === rowIndex
          ? {
              ...row,
              [key]: value
            }
          : row
      )
    );
  };

  const handleBatchRestock = async (e) => {
    e.preventDefault();
    resetMessages();
    setSavingStock(true);

    try {
      const preparedItems = stockRows
        .map((row) => ({
          medicineId: row.medicineId,
          quantity: Number(row.quantity)
        }))
        .filter((row) => row.medicineId || row.quantity);

      if (preparedItems.length === 0) {
        throw new Error("Kamida bitta dori qatori to'ldiring.");
      }

      preparedItems.forEach((item) => {
        if (!item.medicineId) {
          throw new Error("Har bir qatorda dori tanlang.");
        }
        if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
          throw new Error("Har bir qatorda miqdor 0 dan katta bo'lishi kerak.");
        }
      });

      await medicineService.increaseStockBulk(preparedItems);

      setSuccess(
        `${preparedItems.length} ta qator bo'yicha dori qoldig'i muvaffaqiyatli oshirildi.`
      );
      setStockRows([createEmptyRow()]);
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
        <h2 className="text-lg font-semibold text-slate-800">
          Omborga bir nechta dori kiritish
        </h2>
        <p className="mb-4 text-sm text-slate-500">
          Delivery yangi dori nomi qo'shmaydi, mavjud dorilar qoldig'ini birdaniga oshiradi.
        </p>

        <form onSubmit={handleBatchRestock} className="space-y-3">
          {stockRows.map((row, index) => (
            <div
              key={`${row.medicineId}-${index}`}
              className="grid gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-[1fr_180px_auto]"
            >
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-600">
                  Dori tanlang
                </span>
                <select
                  value={row.medicineId}
                  onChange={(e) => updateRow(index, "medicineId", e.target.value)}
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
                value={row.quantity}
                onChange={(e) => updateRow(index, "quantity", e.target.value)}
              />

              <Button
                type="button"
                variant="secondary"
                className="h-fit self-end"
                onClick={() => removeRow(index)}
                disabled={stockRows.length === 1}
              >
                Qatorni o'chirish
              </Button>
            </div>
          ))}

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={addRow}>
              + Qator qo'shish
            </Button>
            <Button type="submit" loading={savingStock}>
              Barchasini omborga kiritish
            </Button>
          </div>
        </form>
      </div>

      <Alert type="success" message={success} />
      <Alert type="error" message={error} />

      <div className="card p-4">
        <h2 className="mb-4 text-lg font-semibold text-slate-800">Dorilar ro'yxati</h2>
        <Table
          data={medicines}
          columns={[
            { key: "name", label: "Nomi" },
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
                row.stock > 0 ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                    Bor
                  </span>
                ) : (
                  <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
                    QOLMADI
                  </span>
                )
            }
          ]}
        />
      </div>
    </div>
  );
}

export default DeliveryDashboard;
