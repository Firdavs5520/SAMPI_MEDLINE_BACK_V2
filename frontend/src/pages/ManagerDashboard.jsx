import { useCallback, useEffect, useState } from "react";
import reportService from "../services/reportService.js";
import Spinner from "../components/Spinner.jsx";
import Alert from "../components/Alert.jsx";
import Button from "../components/Button.jsx";
import { extractErrorMessage, formatCurrency } from "../utils/format.js";

const PERIOD_OPTIONS = [
  { value: "today", label: "Bugun" },
  { value: "week", label: "1 hafta" },
  { value: "month", label: "1 oy" }
];

const PERIOD_LABELS = {
  today: "bugungi",
  week: "so'nggi 1 hafta",
  month: "so'nggi 1 oy",
  all: "barcha davr"
};

const ROLE_TONES = {
  nurse: "border-cyan-200 bg-cyan-50",
  lor: "border-amber-200 bg-amber-50",
  total: "border-indigo-200 bg-indigo-50"
};

const emptyRoleStats = () => ({
  totalRevenue: 0,
  checksCount: 0,
  medicineTypesCount: 0,
  topItem: null
});

const emptyOverview = () => ({
  period: "today",
  inventoryMedicineTypes: 0,
  roles: {
    nurse: emptyRoleStats(),
    lor: emptyRoleStats()
  },
  total: emptyRoleStats()
});

function StatCard({ title, value, hint = "", tone = "default" }) {
  const tones = {
    default: "border-slate-200 bg-white text-slate-800",
    primary: "border-cyan-200 bg-cyan-50 text-cyan-800",
    accent: "border-orange-200 bg-orange-50 text-orange-800",
    danger: "border-rose-200 bg-rose-50 text-rose-700"
  };

  return (
    <div className={`rounded-2xl border p-4 ${tones[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{title}</p>
      <p className="mt-2 break-words text-xl font-bold sm:text-2xl">{value}</p>
      <p className="mt-1 min-h-5 break-words text-xs opacity-80">{hint}</p>
    </div>
  );
}

function formatTopItem(topItem) {
  if (!topItem) {
    return {
      title: "Hali ma'lumot yo'q",
      subtitle: "Tanlangan davrda ishlatilgan xizmat yoki dori topilmadi."
    };
  }

  const itemTypeLabel = topItem.itemType === "service" ? "Xizmat" : "Dori";
  return {
    title: `${itemTypeLabel}: ${topItem.name}`,
    subtitle: `Miqdor: ${topItem.totalQuantity} ta`
  };
}

function RoleSummaryCard({ title, roleKey, stats = emptyRoleStats() }) {
  const tone = ROLE_TONES[roleKey] || "border-slate-200 bg-slate-50";
  const topItem = formatTopItem(stats.topItem);

  return (
    <div className={`rounded-2xl border p-4 ${tone}`}>
      <p className="text-sm font-bold text-slate-800">{title}</p>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-slate-500">Daromad</p>
          <p className="text-base font-bold text-slate-900">{formatCurrency(stats.totalRevenue)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Cheklar</p>
          <p className="text-base font-bold text-slate-900">{stats.checksCount}</p>
        </div>
      </div>

      <div className="mt-3">
        <p className="text-xs text-slate-500">Ishlatilgan dori turlari</p>
        <p className="text-sm font-semibold text-slate-900">{stats.medicineTypesCount}</p>
      </div>

      <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white/80 p-3">
        <p className="text-xs text-slate-500">Eng ko'p ishlatilgan item</p>
        <p className="mt-1 break-words text-sm font-semibold text-slate-900">{topItem.title}</p>
        <p className="mt-1 text-xs text-slate-600">{topItem.subtitle}</p>
      </div>
    </div>
  );
}

function ManagerDashboard() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState("today");
  const [overview, setOverview] = useState(emptyOverview());

  const loadOverview = useCallback(async (nextPeriod, { initial = false } = {}) => {
    if (initial) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    setError("");
    try {
      const data = await reportService.getOverview(nextPeriod);
      setOverview({
        ...emptyOverview(),
        ...data,
        roles: {
          nurse: { ...emptyRoleStats(), ...(data?.roles?.nurse || {}) },
          lor: { ...emptyRoleStats(), ...(data?.roles?.lor || {}) }
        },
        total: { ...emptyRoleStats(), ...(data?.total || {}) }
      });
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      if (initial) {
        setLoading(false);
      } else {
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    loadOverview("today", { initial: true });
  }, [loadOverview]);

  const handlePeriodChange = (nextPeriod) => {
    if (nextPeriod === period) return;
    setPeriod(nextPeriod);
    loadOverview(nextPeriod, { initial: false });
  };

  const safePeriod = overview.period || period;
  const periodHint = PERIOD_LABELS[safePeriod] || PERIOD_LABELS[period];

  if (loading) {
    return <Spinner text="Menejer statistikasi yuklanmoqda..." />;
  }

  return (
    <div className="space-y-6 overflow-x-hidden">
      <div className="card p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-slate-800">Umumiy statistika</h1>
            <p className="break-words text-sm text-slate-500">
              Nurse, LOR va jami bo'yicha alohida statistika ko'rinadi.
            </p>
          </div>

          <Button
            variant="secondary"
            onClick={() => loadOverview(period, { initial: false })}
            loading={refreshing}
            className="self-start sm:self-auto"
          >
            Yangilash
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {PERIOD_OPTIONS.map((option) => {
            const isActive = period === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => handlePeriodChange(option.value)}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  isActive
                    ? "border-primary bg-primary text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:border-primary hover:text-primary"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <Alert type="error" message={error} />

      <section className="card p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="Jami daromad"
            value={formatCurrency(overview.total.totalRevenue)}
            hint={`${periodHint} davr bo'yicha`}
            tone="accent"
          />
          <StatCard
            title="Jami cheklar"
            value={overview.total.checksCount}
            hint={`${periodHint} davr bo'yicha`}
            tone="primary"
          />
          <StatCard
            title="Dori turlari"
            value={overview.inventoryMedicineTypes}
            hint="Tizimda mavjud dori nomenklaturasi"
          />
          <StatCard
            title="Ishlatilgan dori turi"
            value={overview.total.medicineTypesCount}
            hint={`${periodHint} davr ichida ishlatilgan`}
            tone="danger"
          />
        </div>
      </section>

      <section className="card p-4 sm:p-5">
        <h2 className="text-lg font-bold text-slate-800">Rol bo'yicha tafsilotlar</h2>
        <p className="mt-1 text-sm text-slate-500">
          Har bir rolda eng ko'p ishlatilgan xizmat yoki dori ham ko'rsatiladi.
        </p>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <RoleSummaryCard title="Hamshira (Nurse)" roleKey="nurse" stats={overview.roles.nurse} />
          <RoleSummaryCard title="LOR shifokor" roleKey="lor" stats={overview.roles.lor} />
          <RoleSummaryCard title="Jami" roleKey="total" stats={overview.total} />
        </div>
      </section>
    </div>
  );
}

export default ManagerDashboard;
