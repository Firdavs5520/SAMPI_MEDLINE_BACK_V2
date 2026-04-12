import { useEffect, useMemo, useRef, useState } from "react";

const WEEK_DAYS = ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"];

const toYmd = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseYmd = (value) => {
  const safe = String(value || "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(safe);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const formatDisplayDate = (value) => {
  const date = parseYmd(value);
  if (!date) return "";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
};

const getMonthGrid = (monthDate) => {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();

  const firstDay = new Date(year, month, 1);
  const mondayStartOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - mondayStartOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);

    return {
      date,
      ymd: toYmd(date),
      inCurrentMonth: date.getMonth() === month
    };
  });
};

function DatePickerField({ label, value, onChange }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const selectedDate = parseYmd(value) || new Date();
  const [viewMonth, setViewMonth] = useState(
    new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
  );

  useEffect(() => {
    if (!value) return;
    const parsed = parseYmd(value);
    if (!parsed) return;
    setViewMonth(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
  }, [value]);

  useEffect(() => {
    if (!open) return undefined;

    const closeOnOutside = (event) => {
      if (ref.current && !ref.current.contains(event.target)) {
        setOpen(false);
      }
    };

    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const monthGrid = useMemo(() => getMonthGrid(viewMonth), [viewMonth]);
  const currentMonthLabel = viewMonth.toLocaleDateString("uz-UZ", {
    year: "numeric",
    month: "long"
  });
  const todayYmd = toYmd(new Date());

  const moveMonth = (delta) => {
    setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  return (
    <label className="relative block" ref={ref}>
      {label ? <span className="mb-1.5 block text-sm font-medium text-slate-600">{label}</span> : null}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
      >
        <span>{formatDisplayDate(value)}</span>
        <svg
          className="h-4 w-4 text-slate-500"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </button>

      {open ? (
        <div className="absolute z-40 mt-1 w-[min(92vw,320px)] sm:w-[280px] rounded-2xl border border-slate-200 bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => moveMonth(-1)}
              className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              Oldin
            </button>
            <p className="text-sm font-bold capitalize text-slate-800">{currentMonthLabel}</p>
            <button
              type="button"
              onClick={() => moveMonth(1)}
              className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              Keyin
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {WEEK_DAYS.map((day) => (
              <span key={day} className="py-1 text-center text-[11px] font-bold uppercase text-slate-500">
                {day}
              </span>
            ))}

            {monthGrid.map((item) => {
              const selected = item.ymd === value;
              const isToday = item.ymd === todayYmd;
              return (
                <button
                  key={item.ymd}
                  type="button"
                  onClick={() => {
                    onChange(item.ymd);
                    setOpen(false);
                  }}
                  className={`h-8 rounded-lg text-sm transition ${
                    selected
                      ? "bg-primary font-semibold text-white"
                      : item.inCurrentMonth
                        ? "text-slate-700 hover:bg-slate-100"
                        : "text-slate-300 hover:bg-slate-50"
                  } ${isToday && !selected ? "border border-primary/40" : ""}`}
                >
                  {item.date.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </label>
  );
}

export default DatePickerField;
