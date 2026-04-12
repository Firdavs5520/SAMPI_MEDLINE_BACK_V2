import { NavLink } from "react-router-dom";
import { sidebarMenus } from "../utils/constants.js";
import { useAuth } from "../context/AuthContext.jsx";

function MenuIcon({ name, className = "h-5 w-5" }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  };

  switch (name) {
    case "grid":
      return (
        <svg viewBox="0 0 24 24" className={className} {...common}>
          <rect x="4" y="4" width="7" height="7" />
          <rect x="13" y="4" width="7" height="7" />
          <rect x="4" y="13" width="7" height="7" />
          <rect x="13" y="13" width="7" height="7" />
        </svg>
      );
    case "pill":
      return (
        <svg viewBox="0 0 24 24" className={className} {...common}>
          <path d="M8 4a4 4 0 0 1 5.7 0l6.3 6.3a4 4 0 0 1-5.7 5.7L8 9.7A4 4 0 0 1 8 4z" />
          <path d="M9 9l6 6" />
        </svg>
      );
    case "stethoscope":
      return (
        <svg viewBox="0 0 24 24" className={className} {...common}>
          <path d="M6 4v5a4 4 0 0 0 8 0V4" />
          <path d="M10 13v2a4 4 0 1 0 8 0v-1" />
          <circle cx="19" cy="12" r="2" />
          <path d="M6 4h4M10 4h4" />
        </svg>
      );
    case "receipt":
      return (
        <svg viewBox="0 0 24 24" className={className} {...common}>
          <path d="M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21V3z" />
          <path d="M9 8h6M9 12h6M9 16h4" />
        </svg>
      );
    case "plus":
      return (
        <svg viewBox="0 0 24 24" className={className} {...common}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case "truck":
      return (
        <svg viewBox="0 0 24 24" className={className} {...common}>
          <path d="M1 7h13v10H1zM14 10h4l3 3v4h-7z" />
          <circle cx="6" cy="18" r="2" />
          <circle cx="18" cy="18" r="2" />
        </svg>
      );
    case "user-plus":
      return (
        <svg viewBox="0 0 24 24" className={className} {...common}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M19 8v6M16 11h6" />
        </svg>
      );
    case "list":
      return (
        <svg viewBox="0 0 24 24" className={className} {...common}>
          <path d="M8 6h13M8 12h13M8 18h13" />
          <circle cx="4" cy="6" r="1" />
          <circle cx="4" cy="12" r="1" />
          <circle cx="4" cy="18" r="1" />
        </svg>
      );
    case "history":
      return (
        <svg viewBox="0 0 24 24" className={className} {...common}>
          <path d="M3 3v5h5" />
          <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" />
          <path d="M12 8v5l3 2" />
        </svg>
      );
    case "users":
      return (
        <svg viewBox="0 0 24 24" className={className} {...common}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "bar-chart":
      return (
        <svg viewBox="0 0 24 24" className={className} {...common}>
          <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
        </svg>
      );
    case "box":
      return (
        <svg viewBox="0 0 24 24" className={className} {...common}>
          <path d="M3 7l9-4 9 4-9 4-9-4z" />
          <path d="M3 7v10l9 4 9-4V7" />
          <path d="M12 11v10" />
        </svg>
      );
    case "trending":
      return (
        <svg viewBox="0 0 24 24" className={className} {...common}>
          <path d="M3 17l6-6 4 4 7-7" />
          <path d="M14 8h6v6" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" className={className} {...common}>
          <circle cx="12" cy="12" r="8" />
        </svg>
      );
  }
}

function Sidebar({ open, onClose, compact = false, onToggleCompact }) {
  const { role } = useAuth();
  const menus = sidebarMenus[role] || [];
  const hasGroups = menus.some((item) => item.group);
  const groupedMenus = hasGroups
    ? menus.reduce((acc, item) => {
        const groupName = item.group || "Boshqa";
        const lastGroup = acc[acc.length - 1];

        if (!lastGroup || lastGroup.name !== groupName) {
          acc.push({ name: groupName, items: [item] });
          return acc;
        }

        lastGroup.items.push(item);
        return acc;
      }, [])
    : [];

  const linkClassName = ({ isActive }) =>
    `flex items-center rounded-xl px-3 py-2 text-sm font-medium transition ${
      compact ? "lg:justify-center lg:px-2" : "gap-2"
    } ${
      isActive ? "bg-primary text-white shadow-sm" : "text-slate-700 hover:bg-slate-100"
    }`;

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 w-[82vw] max-w-xs transform border-r border-slate-200 bg-white transition lg:static lg:max-w-none lg:translate-x-0 ${compact ? "lg:w-20" : "lg:w-64"} ${open ? "translate-x-0" : "-translate-x-full"}`}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className={`flex items-center gap-2 ${compact ? "lg:justify-center lg:w-full" : ""}`}>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-xs font-extrabold text-primary">
              SM
            </div>
            <h2 className={`text-lg font-bold text-slate-800 ${compact ? "lg:hidden" : ""}`}>
              Sampi Medline
            </h2>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="hidden rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:inline-flex"
              title={compact ? "To'liq menyu" : "Faqat ikonlar"}
              onClick={onToggleCompact}
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {compact ? (
                  <>
                    <path d="M3 7h6M3 12h6M3 17h6" />
                    <path d="M12 6h9v12h-9z" />
                  </>
                ) : (
                  <>
                    <path d="M3 6h18v12H3z" />
                    <path d="M8 6v12" />
                  </>
                )}
              </svg>
            </button>
            <button
              type="button"
              className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 lg:hidden"
              onClick={onClose}
            >
              X
            </button>
          </div>
        </div>

        <nav className={`overflow-y-auto p-4 ${compact ? "space-y-2" : "space-y-3"}`}>
          {hasGroups
            ? groupedMenus.map((group) => (
                <div
                  key={group.name}
                  className={`rounded-2xl p-2 ${compact ? "lg:border-0 lg:bg-transparent lg:px-0" : "border border-slate-200/80 bg-slate-50/80"}`}
                >
                  <p
                    className={`px-2 pb-1 pt-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-500 ${compact ? "lg:hidden" : ""}`}
                  >
                    {group.name}
                  </p>
                  <div className="space-y-1">
                    {group.items.map((item) => (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        end={item.end === true}
                        onClick={onClose}
                        title={compact ? item.label : undefined}
                        className={linkClassName}
                      >
                        <MenuIcon name={item.icon} />
                        <span className={`truncate ${compact ? "lg:hidden" : ""}`}>
                          {item.label}
                        </span>
                      </NavLink>
                    ))}
                  </div>
                </div>
              ))
            : menus.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.end === true}
                  onClick={onClose}
                  title={compact ? item.label : undefined}
                  className={linkClassName}
                >
                  <MenuIcon name={item.icon} />
                  <span className={`truncate ${compact ? "lg:hidden" : ""}`}>{item.label}</span>
                </NavLink>
              ))}
        </nav>
      </div>
    </aside>
  );
}

export default Sidebar;
