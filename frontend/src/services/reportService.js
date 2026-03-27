import api from "./api.js";

const reportService = {
  async getChecks() {
    const { data } = await api.get("/reports/checks");
    return data.data || [];
  },

  async getRevenue(period = "all") {
    const { data } = await api.get("/reports/revenue", {
      params: { period }
    });

    return data.data || { totalRevenue: 0, checksCount: 0, period: "all" };
  },

  async getOverview(period = "all") {
    const { data } = await api.get("/reports/overview", {
      params: { period }
    });

    return (
      data.data || {
        period: "all",
        inventoryMedicineTypes: 0,
        roles: {
          nurse: {
            totalRevenue: 0,
            checksCount: 0,
            medicineTypesCount: 0,
            topItem: null
          },
          lor: {
            totalRevenue: 0,
            checksCount: 0,
            medicineTypesCount: 0,
            topItem: null
          }
        },
        total: {
          totalRevenue: 0,
          checksCount: 0,
          medicineTypesCount: 0,
          topItem: null
        }
      }
    );
  },

  async getStock() {
    const { data } = await api.get("/reports/current-stock");
    return data.data || [];
  },

  async getUsageHistory() {
    const { data } = await api.get("/reports/medicine-usage");
    return data.data || [];
  },

  async getMostUsedMedicines() {
    const { data } = await api.get("/reports/most-used-medicines");
    return data.data || [];
  }
};

export default reportService;
