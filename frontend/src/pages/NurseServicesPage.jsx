import { useEffect, useState } from "react";
import serviceService from "../services/serviceService.js";
import Input from "../components/Input.jsx";
import Button from "../components/Button.jsx";
import Spinner from "../components/Spinner.jsx";
import Alert from "../components/Alert.jsx";
import Table from "../components/Table.jsx";
import { extractErrorMessage, formatCurrency } from "../utils/format.js";

function NurseServicesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [services, setServices] = useState([]);
  const [form, setForm] = useState({ name: "", price: "" });
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const loadServices = async () => {
    setLoading(true);
    setError("");
    try {
      const allServices = await serviceService.getAllServices();
      setServices(allServices.filter((item) => item.type === "nurse"));
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadServices();
  }, []);

  const handleAddService = async (e) => {
    e.preventDefault();
    setSuccess("");
    setError("");
    setSaving(true);

    try {
      const safeName = form.name.trim();
      const safePrice = Number(form.price);

      if (!safeName) {
        throw new Error("Xizmat nomini kiriting.");
      }
      if (!Number.isFinite(safePrice) || safePrice <= 0 || safePrice >= 1000000) {
        throw new Error("Narx > 0 va < 1,000,000 bo'lishi kerak.");
      }

      await serviceService.createService({
        name: safeName,
        type: "nurse",
        price: safePrice
      });

      setSuccess("Yangi nurse xizmati qo'shildi.");
      setForm({ name: "", price: "" });
      await loadServices();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Spinner text="Nurse xizmatlari yuklanmoqda..." />;
  }

  return (
    <div className="space-y-6">
      <div className="card p-4">
        <h2 className="text-lg font-semibold text-slate-800">Xizmat Qoshish</h2>
        <p className="mb-4 text-sm text-slate-500">
          Nurse uchun yangi xizmat va uning narxini kiriting.
        </p>
        <form
          onSubmit={handleAddService}
          className="grid gap-3 md:grid-cols-[1fr_180px_auto]"
        >
          <Input
            label="Xizmat nomi"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
          />
          <Input
            label="Narxi"
            type="number"
            min="1"
            value={form.price}
            onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))}
          />
          <Button type="submit" className="h-fit self-end" loading={saving}>
            Qoshish
          </Button>
        </form>
      </div>

      <Alert type="success" message={success} />
      <Alert type="error" message={error} />

      <div className="card p-4">
        <h3 className="mb-4 text-base font-semibold text-slate-800">
          Mavjud nurse xizmatlari
        </h3>
        <Table
          data={services}
          columns={[
            { key: "name", label: "Xizmat" },
            { key: "type", label: "Turi" },
            {
              key: "price",
              label: "Narxi",
              render: (row) => formatCurrency(row.price)
            }
          ]}
        />
      </div>
    </div>
  );
}

export default NurseServicesPage;
