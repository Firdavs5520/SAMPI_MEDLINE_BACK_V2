import { useEffect, useState } from "react";
import reportService from "../services/reportService.js";
import Spinner from "../components/Spinner.jsx";
import Alert from "../components/Alert.jsx";
import Table from "../components/Table.jsx";
import Button from "../components/Button.jsx";
import { extractErrorMessage } from "../utils/format.js";

function ManagerMostUsedPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mostUsed, setMostUsed] = useState([]);

  const loadMostUsed = async () => {
    setLoading(true);
    setError("");
    try {
      const mostUsedList = await reportService.getMostUsedMedicines();
      setMostUsed(mostUsedList);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMostUsed();
  }, []);

  if (loading) {
    return <Spinner text="Ko'p ishlatilgan dorilar yuklanmoqda..." />;
  }

  return (
    <div className="space-y-6 overflow-x-hidden">
      <div className="card p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Ko'p ishlatilgan dorilar</h1>
            <p className="text-sm text-slate-500">
              Sarflanish miqdori eng yuqori bo'lgan dorilar ro'yxati.
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={loadMostUsed}
            className="self-start sm:self-auto"
          >
            Yangilash
          </Button>
        </div>
      </div>

      <Alert type="error" message={error} />

      <div className="card p-4 sm:p-5">
        <Table
          data={mostUsed}
          columns={[
            { key: "medicineName", label: "Dori" },
            { key: "totalUsedQuantity", label: "Jami sarflangan miqdor" },
            { key: "usageCount", label: "Ishlatishlar soni" }
          ]}
        />
      </div>
    </div>
  );
}

export default ManagerMostUsedPage;
