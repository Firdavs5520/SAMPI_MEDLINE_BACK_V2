import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "../components/Sidebar.jsx";
import Navbar from "../components/Navbar.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const SIDEBAR_COMPACT_KEY = "sampi_sidebar_compact";

function DashboardLayout() {
  const location = useLocation();
  const { role } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCompact, setSidebarCompact] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(SIDEBAR_COMPACT_KEY) === "1";
  });
  const isLorSelectPage = role === "lor" && location.pathname === "/lor/select";

  const handleToggleSidebarCompact = () => {
    setSidebarCompact((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(SIDEBAR_COMPACT_KEY, next ? "1" : "0");
      }
      return next;
    });
  };

  if (isLorSelectPage) {
    return (
      <div className="min-h-screen bg-slate-100">
        <main className="min-w-0 p-3 sm:p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full overflow-x-hidden bg-slate-100">
      <Sidebar
        open={sidebarOpen}
        compact={sidebarCompact}
        onClose={() => setSidebarOpen(false)}
        onToggleCompact={handleToggleSidebarCompact}
      />

      {sidebarOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <div className="relative z-10 flex min-h-screen min-w-0 flex-1 flex-col">
        <Navbar onMenuOpen={() => setSidebarOpen(true)} />
        <main className="min-w-0 flex-1 p-3 sm:p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default DashboardLayout;
