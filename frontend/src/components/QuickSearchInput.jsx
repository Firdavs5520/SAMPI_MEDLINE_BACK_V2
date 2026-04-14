import { useMemo, useState } from "react";

const normalizeText = (value) =>
  String(value ?? "")
    .toLocaleLowerCase("uz-UZ")
    .trim();

function QuickSearchInput({
  label = "Qidirish",
  placeholder = "Qidirish...",
  value,
  onChange,
  inputRef = null,
  items = [],
  getItemLabel = (item) => item?.name || "",
  onPick,
  maxSuggestions = 7,
  emptyText = "Mos natija topilmadi"
}) {
  const [open, setOpen] = useState(false);
  const query = normalizeText(value);

  const suggestions = useMemo(() => {
    if (!query) return [];

    return items
      .map((item) => {
        const labelText = String(getItemLabel(item) || "");
        const normalized = normalizeText(labelText);
        const index = normalized.indexOf(query);
        return { item, labelText, index };
      })
      .filter((entry) => entry.index >= 0)
      .sort((a, b) => {
        if (a.index !== b.index) return a.index - b.index;
        return a.labelText.localeCompare(b.labelText, "uz");
      })
      .slice(0, maxSuggestions);
  }, [getItemLabel, items, maxSuggestions, query]);

  return (
    <div className="relative">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-slate-600">{label}</span>
        <input
          ref={inputRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            setTimeout(() => setOpen(false), 120);
          }}
          placeholder={placeholder}
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-primary focus:ring-4 focus:ring-primary/10 sm:text-sm"
        />
      </label>

      {open && query ? (
        <div className="animate-dropdown-pop absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
          {suggestions.length > 0 ? (
            suggestions.map((entry) => (
              <button
                key={`${entry.item?._id || entry.labelText}-${entry.index}`}
                type="button"
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-100"
                onMouseDown={(event) => {
                  event.preventDefault();
                  onPick?.(entry.item);
                  setOpen(false);
                }}
              >
                <span className="truncate">{entry.labelText}</span>
                <span className="ml-2 text-xs text-slate-400">Tanlash</span>
              </button>
            ))
          ) : (
            <p className="px-3 py-2 text-sm text-slate-500">{emptyText}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default QuickSearchInput;
