import { useEffect, useState } from "react";
import reportService from "../services/reportService.js";
import Spinner from "../components/Spinner.jsx";
import Alert from "../components/Alert.jsx";
import Table from "../components/Table.jsx";
import Button from "../components/Button.jsx";
import { roleLabels } from "../utils/constants.js";
import { extractErrorMessage, formatDateTime } from "../utils/format.js";

function ManagerUsageHistoryPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [usageHistory, setUsageHistory] = useState([]);

  const loadUsageHistory = async () => {
    setLoading(true);
    setError("");
    try {
      const usageList = await reportService.getUsageHistory();
      setUsageHistory(usageList);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsageHistory();
  }, []);

  if (loading) {
    return <Spinner text="Dori sarfi tarixi yuklanmoqda..." />;
  }

  return (
    <div className="space-y-6 overflow-x-hidden">
      <div className="card p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Dori sarfi tarixi</h1>
            <p className="text-sm text-slate-500">
              Qaysi dori, kim tomonidan, qachon ishlatilgani.
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={loadUsageHistory}
            className="self-start sm:self-auto"
          >
            Yangilash
          </Button>
        </div>
      </div>

      <Alert type="error" message={error} />

      <div className="card p-4 sm:p-5">
        <Table
          data={usageHistory}
          columns={[
            {
              key: "medicine",
              label: "Dori",
              render: (row) => row.medicineId?.name || "-"
            },
            { key: "quantity", label: "Miqdor" },
            {
              key: "usedBy",
              label: "Ishlatgan xodim",
              render: (row) =>
                row.usedBy?.name
                  ? `${row.usedBy.name} (${roleLabels[row.usedBy.role] || row.usedBy.role})`
                  : "-"
            },
            {
              key: "usedAt",
              label: "Sana",
              render: (row) => formatDateTime(row.usedAt)
            }
          ]}
        />
      </div>
    </div>
  );
}

export default ManagerUsageHistoryPage;
