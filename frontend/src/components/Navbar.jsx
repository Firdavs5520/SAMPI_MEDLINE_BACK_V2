import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { roleHomePath, roleLabels } from "../utils/constants.js";
import Button from "./Button.jsx";

function Navbar({ onMenuOpen }) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const handleGoHome = () => {
    if (user?.role) {
      navigate(roleHomePath[user.role]);
    }
  };

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="flex min-w-0 items-center justify-between gap-2 px-3 py-3 sm:gap-3 sm:px-4 lg:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onMenuOpen}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-600 lg:hidden"
          >
            Menyu
          </button>
          <button
            type="button"
            onClick={handleGoHome}
            className="min-w-0 rounded-lg px-2 py-1 text-left text-sm text-slate-600 hover:bg-slate-100"
          >
            <div className="truncate font-semibold text-slate-800">{user?.name}</div>
            <div className="truncate text-xs">{roleLabels[user?.role] || "-"}</div>
          </button>
        </div>
        <Button
          variant="secondary"
          onClick={handleLogout}
          className="shrink-0 px-3 py-2 text-xs sm:text-sm"
        >
          Chiqish
        </Button>
      </div>
    </header>
  );
}

export default Navbar;
