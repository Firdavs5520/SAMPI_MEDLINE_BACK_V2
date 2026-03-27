import { useEffect, useMemo, useState } from "react";
import reportService from "../services/reportService.js";
import Spinner from "../components/Spinner.jsx";
import Alert from "../components/Alert.jsx";
import Table from "../components/Table.jsx";
import Button from "../components/Button.jsx";
import { extractErrorMessage } from "../utils/format.js";

function getStockStatus(stockValue) {
  const safeStock = Number(stockValue) || 0;
  if (safeStock <= 0) {
    return { label: "Qolmadi", className: "bg-rose-100 text-rose-700" };
  }
  if (safeStock <= 10) {
    return { label: "Kam qoldi", className: "bg-amber-100 text-amber-700" };
  }
  return { label: "Mavjud", className: "bg-emerald-100 text-emerald-700" };
}

function ManagerStockPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stock, setStock] = useState([]);

  const loadStock = async () => {
    setLoading(true);
    setError("");
    try {
      const stockList = await reportService.getStock();
      setStock(stockList);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStock();
  }, []);

  const totalMedicines = useMemo(() => stock.length, [stock]);
  const outOfStockCount = useMemo(
    () => stock.filter((item) => Number(item.stock) <= 0).length,
    [stock]
  );
  const lowStockCount = useMemo(
    () => stock.filter((item) => Number(item.stock) > 0 && Number(item.stock) <= 10).length,
    [stock]
  );

  if (loading) {
    return <Spinner text="Ombor qoldiqlari yuklanmoqda..." />;
  }

  return (
    <div className="space-y-6 overflow-x-hidden">
      <div className="card p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Ombor qoldiqlari</h1>
            <p className="text-sm text-slate-500">Dorilar bo'yicha joriy qoldiq holati.</p>
          </div>
          <Button variant="secondary" onClick={loadStock} className="self-start sm:self-auto">
            Yangilash
          </Button>
        </div>
      </div>

      <Alert type="error" message={error} />

      <div className="card p-4 sm:p-5">
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-xs text-slate-500">Jami dori turlari</p>
            <p className="text-lg font-bold text-slate-800">{totalMedicines}</p>
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
            <p className="text-xs text-rose-500">Qolmagan</p>
            <p className="text-lg font-bold text-rose-700">{outOfStockCount}</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-xs text-amber-600">Kam qolgan (1-10)</p>
            <p className="text-lg font-bold text-amber-700">{lowStockCount}</p>
          </div>
        </div>

        <Table
          data={stock}
          columns={[
            { key: "name", label: "Dori nomi" },
            {
              key: "stock",
              label: "Qoldiq",
              render: (row) => Number(row.stock) || 0
            },
            {
              key: "status",
              label: "Holat",
              render: (row) => {
                const status = getStockStatus(row.stock);
                return (
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${status.className}`}
                  >
                    {status.label}
                  </span>
                );
              }
            }
          ]}
        />
      </div>
    </div>
  );
}

export default ManagerStockPage;
