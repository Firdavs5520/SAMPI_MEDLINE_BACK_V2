import { useEffect, useMemo, useState } from "react";
import usageService from "../services/usageService.js";
import Spinner from "../components/Spinner.jsx";
import Alert from "../components/Alert.jsx";
import Table from "../components/Table.jsx";
import Button from "../components/Button.jsx";
import QuickSearchInput from "../components/QuickSearchInput.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { extractErrorMessage, formatCurrency, formatDateTime } from "../utils/format.js";

const paymentMethodLabels = {
  cash: "Naqd",
  card: "Karta",
  transfer: "O'tkazma"
};

function LorChecksPage() {
  const { lorIdentity } = useAuth();
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [checks, setChecks] = useState([]);
  const [query, setQuery] = useState("");
  const checkSuggestions = useMemo(() => {
    const uniq = new Map();
    checks.forEach((item) => {
      const name = String(item?.patient?.fullName || "").trim();
      if (!name) return;
      const key = name.toLowerCase();
      if (!uniq.has(key)) {
        uniq.set(key, { id: key, name });
      }
    });
    return Array.from(uniq.values());
  }, [checks]);

  const loadChecks = async (searchValue = "") => {
    const isInitial = loading;
    if (!isInitial) {
      setSearching(true);
    }
    setError("");
    try {
      const data = await usageService.getMyChecks(searchValue, lorIdentity);
      setChecks(data);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
      setSearching(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadChecks(query.trim());
    }, 220);
    return () => clearTimeout(timer);
  }, [query, lorIdentity]);

  const clearSearch = () => {
    setQuery("");
  };

  if (loading) {
    return <Spinner text="Mening cheklarim yuklanmoqda..." />;
  }

  return (
    <div className="space-y-6 overflow-x-hidden">
      <div className="card p-4 sm:p-5">
        <h1 className="text-xl font-bold text-slate-800">Mening cheklarim</h1>
        <p className="mt-1 text-sm text-slate-500">
          Faqat siz yaratgan cheklar chiqadi. Bemor ism-familiyasi bo'yicha qidiring.
        </p>
        <p className="mt-1 text-xs font-semibold text-slate-500">
          Tanlangan LOR: {lorIdentity ? lorIdentity.toUpperCase() : "-"}
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
          <QuickSearchInput
            label="Bemor ism-familiyasi"
            placeholder="Masalan: Ali Valiyev"
            value={query}
            onChange={setQuery}
            items={checkSuggestions}
            getItemLabel={(item) => item?.name || ""}
            onPick={(item) => setQuery(item?.name || "")}
            emptyText="Mos bemor topilmadi"
          />
          <Button
            type="button"
            variant="secondary"
            onClick={clearSearch}
            disabled={!query && !searching}
            className="h-fit self-end"
          >
            Tozalash
          </Button>
        </div>
      </div>

      <Alert type="error" message={error} />

      <div className="card p-4 sm:p-5">
        <Table
          data={checks}
          columns={[
            {
              key: "lorIdentity",
              label: "LOR",
              render: (row) => {
                const value = String(row?.createdBy?.lorIdentity || "");
                return value ? value.toUpperCase().replace("LOR", "LOR-") : "-";
              }
            },
            {
              key: "patient",
              label: "Bemor",
              render: (row) => row.patient?.fullName || "-"
            },
            {
              key: "items",
              label: "Xizmatlar",
              render: (row) => (
                <div className="space-y-1">
                  {(row.items || []).map((item, idx) => (
                    <div key={`${item.name}-${idx}`} className="text-xs leading-5 text-slate-700">
                      {item.name} x{item.quantity}
                    </div>
                  ))}
                </div>
              )
            },
            {
              key: "total",
              label: "Jami",
              render: (row) => `${formatCurrency(row.total)} so'm`
            },
            {
              key: "cashierStatus",
              label: "Kassa holati",
              render: (row) => {
                const accepted = Boolean(row?.cashierStatus?.accepted);
                return (
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                      accepted
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {accepted ? "Qabul qilingan" : "Kutilmoqda"}
                  </span>
                );
              }
            },
            {
              key: "paidAmount",
              label: "To'langan",
              render: (row) =>
                row?.cashierStatus?.accepted
                  ? `${formatCurrency(row.cashierStatus.paidAmount || 0)} so'm`
                  : "-"
            },
            {
              key: "debtAmount",
              label: "Qarz",
              render: (row) =>
                row?.cashierStatus?.accepted
                  ? `${formatCurrency(row.cashierStatus.debtAmount || 0)} so'm`
                  : "-"
            },
            {
              key: "paymentMethod",
              label: "To'lov",
              render: (row) =>
                row?.cashierStatus?.accepted
                  ? paymentMethodLabels[row.cashierStatus.paymentMethod] || row.cashierStatus.paymentMethod
                  : "-"
            },
            {
              key: "createdAt",
              label: "Sana",
              render: (row) => formatDateTime(row.createdAt)
            }
          ]}
        />
      </div>
    </div>
  );
}

export default LorChecksPage;
