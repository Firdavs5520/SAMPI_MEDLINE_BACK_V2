import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "../components/Sidebar.jsx";
import Navbar from "../components/Navbar.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const SIDEBAR_COMPACT_KEY = "sampi_sidebar_compact";
const PULL_REFRESH_TRIGGER = 72;
const PULL_REFRESH_MAX = 110;

const getWindowScrollTop = () =>
  window.scrollY ||
  document.documentElement.scrollTop ||
  document.body.scrollTop ||
  0;

function DashboardLayout() {
  const location = useLocation();
  const { role } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCompact, setSidebarCompact] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(SIDEBAR_COMPACT_KEY) === "1";
  });
  const [pullDistance, setPullDistance] = useState(0);
  const [pullReady, setPullReady] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const pullStartYRef = useRef(null);
  const isPullingRef = useRef(false);
  const readyRef = useRef(false);
  const isRefreshingRef = useRef(false);
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

  useEffect(() => {
    readyRef.current = pullReady;
  }, [pullReady]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const canUseTouch = window.matchMedia?.("(pointer: coarse)")?.matches;
    if (!canUseTouch) return undefined;

    const stopPulling = () => {
      pullStartYRef.current = null;
      isPullingRef.current = false;
    };

    const onTouchStart = (event) => {
      if (event.touches.length !== 1 || isRefreshingRef.current) return;
      const currentTop = getWindowScrollTop();
      const touchY = event.touches[0]?.clientY ?? 0;

      if (currentTop <= 0 && touchY <= 120) {
        pullStartYRef.current = touchY;
        isPullingRef.current = true;
      }
    };

    const onTouchMove = (event) => {
      if (!isPullingRef.current || pullStartYRef.current == null || isRefreshingRef.current) {
        return;
      }

      const currentY = event.touches[0]?.clientY ?? pullStartYRef.current;
      const delta = currentY - pullStartYRef.current;

      if (delta <= 0) {
        setPullDistance(0);
        setPullReady(false);
        return;
      }

      const nextDistance = Math.min(PULL_REFRESH_MAX, delta * 0.48);
      const isReady = nextDistance >= PULL_REFRESH_TRIGGER;
      setPullDistance(nextDistance);
      setPullReady(isReady);
      event.preventDefault();
    };

    const onTouchEnd = () => {
      if (!isPullingRef.current || isRefreshingRef.current) {
        return;
      }

      if (readyRef.current) {
        isRefreshingRef.current = true;
        setIsRefreshing(true);
        setPullDistance(PULL_REFRESH_TRIGGER);
        setTimeout(() => {
          window.location.reload();
        }, 220);
      } else {
        setPullDistance(0);
        setPullReady(false);
      }

      stopPulling();
    };

    const onTouchCancel = () => {
      stopPulling();
      if (!isRefreshingRef.current) {
        setPullDistance(0);
        setPullReady(false);
      }
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchCancel, { passive: true });

    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchCancel);
    };
  }, []);

  if (isLorSelectPage) {
    return (
      <div className="min-h-screen bg-slate-100">
        <main className="min-w-0 p-2.5 pb-4 sm:p-4 lg:p-6">
          <div key={location.pathname} className="route-enter">
            <Outlet />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell flex min-h-screen w-full overflow-x-hidden bg-slate-100">
      <div
        className="pointer-events-none fixed left-1/2 top-2 z-[35] -translate-x-1/2 transition-transform duration-200"
        style={{ transform: `translate(-50%, ${-56 + pullDistance}px)` }}
      >
        <div
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold shadow ${
            pullReady
              ? "border-cyan-300 bg-cyan-600 text-white"
              : "border-slate-200 bg-white text-slate-700"
          }`}
        >
          {isRefreshing
            ? "Yangilanmoqda..."
            : pullReady
              ? "Qo'yib yuboring, yangilanadi"
              : "Yangilash uchun pastga torting"}
        </div>
      </div>

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

      <div className="relative flex min-h-screen min-w-0 flex-1 flex-col">
        <Navbar onMenuOpen={() => setSidebarOpen(true)} />
        <main className="min-w-0 flex-1 p-2.5 pb-4 sm:p-4 lg:p-6">
          <div key={location.pathname} className="route-enter">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

export default DashboardLayout;
