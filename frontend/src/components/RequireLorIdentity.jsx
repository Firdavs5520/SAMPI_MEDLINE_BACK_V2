import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

function RequireLorIdentity() {
  const location = useLocation();
  const { role, lorIdentity } = useAuth();

  if (role !== "lor") {
    return <Outlet />;
  }

  const isSelectPage = location.pathname === "/lor/select";
  const hasIdentity = Boolean(lorIdentity);

  if (!hasIdentity && !isSelectPage) {
    return <Navigate to="/lor/select" replace />;
  }

  return <Outlet />;
}

export default RequireLorIdentity;
