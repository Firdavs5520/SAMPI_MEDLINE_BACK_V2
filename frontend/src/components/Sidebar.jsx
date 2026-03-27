import { NavLink } from "react-router-dom";
import { sidebarMenus } from "../utils/constants.js";
import { useAuth } from "../context/AuthContext.jsx";

function Sidebar({ open, onClose }) {
  const { role, lorIdentity } = useAuth();
  const baseMenus = sidebarMenus[role] || [];
  const menus =
    role === "lor" && !lorIdentity
      ? baseMenus.filter((item) => item.path === "/lor/select")
      : baseMenus;

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 w-[82vw] max-w-xs transform border-r border-slate-200 bg-white transition lg:static lg:w-64 lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Sampi Medline</h2>
          </div>
          <button
            type="button"
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 lg:hidden"
            onClick={onClose}
          >
            X
          </button>
        </div>

        <nav className="space-y-2 p-4">
          {menus.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end === true}
              onClick={onClose}
              className={({ isActive }) =>
                `block rounded-xl px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? "bg-primary text-white"
                    : "text-slate-700 hover:bg-slate-100"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </aside>
  );
}

export default Sidebar;
