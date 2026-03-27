import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import serviceService from "../services/serviceService.js";
import Spinner from "../components/Spinner.jsx";
import Alert from "../components/Alert.jsx";
import Table from "../components/Table.jsx";
import Button from "../components/Button.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { extractErrorMessage, formatCurrency } from "../utils/format.js";

function StatCard({ title, value, hint = "", tone = "default" }) {
  const tones = {
    default: "border-slate-200 bg-white text-slate-800",
    primary: "border-cyan-200 bg-cyan-50 text-cyan-800",
    accent: "border-orange-200 bg-orange-50 text-orange-800"
  };

  return (
    <div className={`rounded-2xl border p-4 ${tones[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{title}</p>
      <p className="mt-2 break-words text-xl font-bold sm:text-2xl">{value}</p>
      <p className="mt-1 min-h-5 break-words text-xs opacity-80">{hint}</p>
    </div>
  );
}

function LorDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [services, setServices] = useState([]);

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

  const totalServices = useMemo(() => services.length, [services]);
  const averagePrice = useMemo(() => {
    if (!services.length) return 0;
    const total = services.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
    return Math.round(total / services.length);
  }, [services]);

  if (loading) {
    return <Spinner text="LOR paneli yuklanmoqda..." />;
  }

  return (
    <div className="space-y-6 overflow-x-hidden">
      <div className="card p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-slate-800">LOR paneli</h1>
            <p className="break-words text-sm text-slate-500">
              LOR faqat xizmatlar bilan ishlaydi, dorilar ko'rsatilmaydi.
            </p>
          </div>
          <Button variant="secondary" onClick={loadServices} className="self-start sm:self-auto">
            Yangilash
          </Button>
        </div>
      </div>

      <Alert type="error" message={error} />

      <section className="card p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard
            title="Jami LOR xizmatlari"
            value={totalServices}
            hint="Tizimdagi LOR xizmatlari soni"
            tone="primary"
          />
          <StatCard
            title="O'rtacha narx"
            value={formatCurrency(averagePrice)}
            hint="LOR xizmatlari bo'yicha o'rtacha narx"
            tone="accent"
          />
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Tezkor amallar
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link to="/lor/services">
                <Button className="px-3 py-2 text-xs sm:text-sm">Xizmat ishlatish</Button>
              </Link>
              <Link to="/lor/services/add">
                <Button variant="secondary" className="px-3 py-2 text-xs sm:text-sm">
                  Xizmat qo'shish
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="card p-4 sm:p-5">
        <h2 className="mb-4 text-lg font-semibold text-slate-800">LOR xizmatlar ro'yxati</h2>
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
      </section>
    </div>
  );
}

export default LorDashboard;
