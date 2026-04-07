import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { roleHomePath } from "../utils/constants.js";

function AccessDeniedPage() {
  const { role } = useAuth();
  const homePath = useMemo(() => roleHomePath[role] || "/login", [role]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="card w-full max-w-md p-6 text-center">
        <h1 className="text-2xl font-bold text-rose-600">Kirish rad etildi</h1>
        <p className="mt-2 text-sm text-slate-600">
          Sizda bu sahifaga kirish huquqi yo'q.
        </p>
        <Link
          to={homePath}
          className="mt-5 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
        >
          Bosh sahifaga qaytish
        </Link>
      </div>
    </div>
  );
}

export default AccessDeniedPage;
