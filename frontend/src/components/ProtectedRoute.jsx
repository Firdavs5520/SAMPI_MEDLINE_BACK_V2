import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import AccessDeniedPage from "../pages/AccessDeniedPage.jsx";

function ProtectedRoute({ allowedRoles }) {
  const { token, role } = useAuth();

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    return <AccessDeniedPage />;
  }

  return <Outlet />;
}

export default ProtectedRoute;
