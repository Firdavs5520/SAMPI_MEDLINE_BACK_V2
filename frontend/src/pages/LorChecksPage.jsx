import { useEffect, useMemo, useRef, useState } from "react";
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

const getDebtAmount = (row) => Number(row?.cashierStatus?.debtAmount || 0);

const hasDebt = (row) => Boolean(row?.cashierStatus?.accepted) && getDebtAmount(row) > 0;

const getCheckKey = (row) => String(row?._id || row?.id || row?.checkId || "");

const getPatientInitials = (value) => {
  const words = String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) return "BM";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] || ""}${words[1][0] || ""}`.toUpperCase();
};

function LorChecksPage() {
  const { lorIdentity } = useAuth();
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [checks, setChecks] = useState([]);
  const [query, setQuery] = useState("");
  const [hoverPreviewCheckKey, setHoverPreviewCheckKey] = useState("");
  const hoverTimerRef = useRef(null);
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

  const debtSummary = useMemo(
    () =>
      checks.reduce(
        (acc, row) => {
          if (!hasDebt(row)) return acc;
          return {
            count: acc.count + 1,
            totalDebt: acc.totalDebt + getDebtAmount(row)
          };
        },
        { count: 0, totalDebt: 0 }
      ),
    [checks]
  );

  const prioritizedChecks = useMemo(
    () =>
      checks
        .map((item, index) => ({
          item,
          index,
          debt: hasDebt(item)
        }))
        .sort((a, b) => Number(b.debt) - Number(a.debt) || a.index - b.index)
        .map(({ item }) => item),
    [checks]
  );

  const hoverPreviewRow = useMemo(
    () =>
      prioritizedChecks.find((row) => getCheckKey(row) === hoverPreviewCheckKey) || null,
    [prioritizedChecks, hoverPreviewCheckKey]
  );

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

  useEffect(
    () => () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
      }
    },
    []
  );

  const clearHoverTimer = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  };

  const clearHoverPreview = () => {
    clearHoverTimer();
    setHoverPreviewCheckKey("");
  };

  const queueHoverPreview = (row) => {
    const nextKey = getCheckKey(row);
    if (!nextKey) return;

    clearHoverTimer();

    setHoverPreviewCheckKey("");
    hoverTimerRef.current = setTimeout(() => {
      setHoverPreviewCheckKey(nextKey);
      hoverTimerRef.current = null;
    }, 3000);
  };

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
        {debtSummary.count > 0 && (
          <div className="mb-4 rounded-xl border-2 border-rose-300 bg-rose-50 p-4 text-rose-800 shadow-sm">
            <p className="text-sm font-black uppercase tracking-wide text-rose-700">Diqqat: Qarzdor bemorlar bor</p>
            <p className="mt-1 text-sm font-semibold">
              Qarzdorlar soni: {debtSummary.count} ta, jami qarz: {formatCurrency(debtSummary.totalDebt)} so'm
            </p>
            <p className="mt-1 text-xs font-medium text-rose-700">
              Qarzdor qatorlar yuqoriga chiqarildi va qizil rangda belgilandi.
            </p>
          </div>
        )}
        <div onMouseLeave={clearHoverPreview}>
          <Table
            data={prioritizedChecks}
            rowClassName={(row, rowIndex) => {
              const debt = hasDebt(row);
              if (debt) {
                return "bg-rose-50/90 ring-1 ring-inset ring-rose-200 hover:bg-rose-100/90";
              }

              if (row?.cashierStatus?.accepted) {
                return rowIndex % 2 === 0
                  ? "bg-sky-50/55 hover:bg-sky-100/70"
                  : "bg-cyan-50/40 hover:bg-cyan-100/70";
              }

              return rowIndex % 2 === 0
                ? "bg-amber-50/45 hover:bg-amber-100/70"
                : "bg-white hover:bg-slate-50/85";
            }}
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
              render: (row) => {
                const patientName = row.patient?.fullName || "-";
                const isQueued = getCheckKey(row) === hoverPreviewCheckKey;
                return (
                  <div
                    className="relative max-w-[260px]"
                    onMouseEnter={() => queueHoverPreview(row)}
                    onMouseLeave={clearHoverTimer}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[10px] font-black tracking-wide text-white">
                        {getPatientInitials(patientName)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-800">{patientName}</p>
                        <p className="truncate text-[11px] font-semibold text-slate-500">
                          Chek: {row.checkId || "-"} {isQueued ? "- Ko'rsatiladi..." : ""}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              }
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
              render: (row) => {
                if (!row?.cashierStatus?.accepted) return "-";
                const debt = getDebtAmount(row);
                if (debt <= 0) {
                  return `${formatCurrency(debt)} so'm`;
                }

                return (
                  <span className="inline-flex animate-pulse items-center rounded-md border border-rose-300 bg-rose-100 px-2.5 py-1 text-xs font-extrabold uppercase tracking-wide text-rose-800">
                    Qarzdor: {formatCurrency(debt)} so'm
                  </span>
                );
              }
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
        {hoverPreviewRow && (
          <div className="mt-4 rounded-xl border border-cyan-200 bg-cyan-50/80 p-4 text-cyan-900 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-cyan-700">Hover tafsilot</p>
            <p className="mt-1 text-sm font-semibold">
              {hoverPreviewRow.patient?.fullName || "-"} - {hoverPreviewRow.checkId || "-"}
            </p>
            {hoverPreviewRow?.cashierStatus?.accepted ? (
              <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                <p>
                  <span className="font-bold">Kassir:</span>{" "}
                  {hoverPreviewRow.cashierStatus.acceptedByName || "-"}
                </p>
                <p>
                  <span className="font-bold">Telefon:</span>{" "}
                  {hoverPreviewRow.cashierStatus.patientPhone || "-"}
                </p>
                <p>
                  <span className="font-bold">To'lov raqami:</span>{" "}
                  {hoverPreviewRow.cashierStatus.checkCode || hoverPreviewRow.checkId || "-"}
                </p>
                <p>
                  <span className="font-bold">Qabul vaqti:</span>{" "}
                  {formatDateTime(hoverPreviewRow.cashierStatus.acceptedAt)}
                </p>
                <p>
                  <span className="font-bold">To'lov turi:</span>{" "}
                  {paymentMethodLabels[hoverPreviewRow.cashierStatus.paymentMethod] ||
                    hoverPreviewRow.cashierStatus.paymentMethod ||
                    "-"}
                </p>
                <p>
                  <span className="font-bold">Qarz:</span>{" "}
                  {formatCurrency(hoverPreviewRow.cashierStatus.debtAmount || 0)} so'm
                </p>
                <p className="sm:col-span-2">
                  <span className="font-bold">Izoh:</span>{" "}
                  {hoverPreviewRow.cashierStatus.note || "Izoh qoldirilmagan"}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-xs font-semibold text-amber-700">
                Bu bemor cheki hali kassaga qabul qilinmagan.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default LorChecksPage;
