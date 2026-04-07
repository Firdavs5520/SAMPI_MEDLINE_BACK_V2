import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import RequireLorIdentity from "./components/RequireLorIdentity.jsx";
import DashboardLayout from "./layouts/DashboardLayout.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import NurseDashboard from "./pages/NurseDashboard.jsx";
import NurseMedicinesPage from "./pages/NurseMedicinesPage.jsx";
import NurseServicesPage from "./pages/NurseServicesPage.jsx";
import LorSelectPage from "./pages/LorSelectPage.jsx";
import LorChecksPage from "./pages/LorChecksPage.jsx";
import LorServicesPage from "./pages/LorServicesPage.jsx";
import LorServiceCreatePage from "./pages/LorServiceCreatePage.jsx";
import DeliveryDashboard from "./pages/DeliveryDashboard.jsx";
import CashierDashboard from "./pages/CashierDashboard.jsx";
import ManagerDashboard from "./pages/ManagerDashboard.jsx";
import ManagerStockPage from "./pages/ManagerStockPage.jsx";
import ManagerMostUsedPage from "./pages/ManagerMostUsedPage.jsx";
import ManagerUsageHistoryPage from "./pages/ManagerUsageHistoryPage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";
import { useAuth } from "./context/AuthContext.jsx";
import { roleHomePath } from "./utils/constants.js";

function App() {
  const { token, role, lorIdentity } = useAuth();

  const home =
    token && role
      ? role === "lor"
        ? lorIdentity
          ? "/lor/checks"
          : "/lor/select"
        : roleHomePath[role]
      : "/login";

  return (
    <Routes>
      <Route path="/" element={<Navigate to={home} replace />} />
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute allowedRoles={["nurse"]} />}>
        <Route element={<DashboardLayout />}>
          <Route path="/nurse" element={<NurseDashboard />} />
          <Route path="/nurse/medicines" element={<NurseMedicinesPage />} />
          <Route path="/nurse/services" element={<NurseServicesPage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute allowedRoles={["lor"]} />}>
        <Route element={<DashboardLayout />}>
          <Route
            path="/lor"
            element={<Navigate to={lorIdentity ? "/lor/checks" : "/lor/select"} replace />}
          />
          <Route
            path="/lor/select"
            element={
              lorIdentity ? <Navigate to="/lor/checks" replace /> : <LorSelectPage />
            }
          />

          <Route element={<RequireLorIdentity />}>
            <Route path="/lor/checks" element={<LorChecksPage />} />
            <Route path="/lor/services" element={<LorServicesPage />} />
            <Route path="/lor/services/add" element={<LorServiceCreatePage />} />
          </Route>
        </Route>
      </Route>

      <Route element={<ProtectedRoute allowedRoles={["delivery"]} />}>
        <Route element={<DashboardLayout />}>
          <Route path="/delivery" element={<DeliveryDashboard />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute allowedRoles={["cashier"]} />}>
        <Route element={<DashboardLayout />}>
          <Route path="/cashier" element={<Navigate to="/cashier/nurse-patients" replace />} />
          <Route
            path="/cashier/nurse-patients"
            element={<CashierDashboard forcedSection="nurse-patients" />}
          />
          <Route
            path="/cashier/lor-patients"
            element={<CashierDashboard forcedSection="lor-patients" />}
          />
          <Route
            path="/cashier/nurse-entries"
            element={<CashierDashboard forcedSection="nurse-entries" />}
          />
          <Route
            path="/cashier/nurse-history"
            element={<CashierDashboard forcedSection="nurse-history" />}
          />
          <Route
            path="/cashier/lor-entries"
            element={<CashierDashboard forcedSection="lor-entries" />}
          />
          <Route
            path="/cashier/lor-history"
            element={<CashierDashboard forcedSection="lor-history" />}
          />
          <Route
            path="/cashier/nurse-specialists"
            element={<CashierDashboard forcedSection="nurse-specialists" />}
          />
          <Route
            path="/cashier/lor-specialists"
            element={<CashierDashboard forcedSection="lor-specialists" />}
          />
          <Route
            path="/cashier/journal"
            element={<CashierDashboard forcedSection="journal" />}
          />
        </Route>
      </Route>

      <Route element={<ProtectedRoute allowedRoles={["manager"]} />}>
        <Route element={<DashboardLayout />}>
          <Route path="/manager" element={<ManagerDashboard />} />
          <Route path="/manager/stock" element={<ManagerStockPage />} />
          <Route path="/manager/most-used" element={<ManagerMostUsedPage />} />
          <Route path="/manager/usage-history" element={<ManagerUsageHistoryPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;
