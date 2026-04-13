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
        lorIdentities: {
          lor1: { totalRevenue: 0, checksCount: 0 },
          lor2: { totalRevenue: 0, checksCount: 0 }
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

  async getShiftCloseReport(date) {
    const { data } = await api.get("/reports/shift-close", {
      params: { date }
    });
    return (
      data.data || {
        date: date || "",
        shift: { fromLabel: "08:00", toLabel: "02:00" },
        totals: {
          totalAmount: 0,
          totalPaidAmount: 0,
          totalDebtAmount: 0,
          entriesCount: 0
        },
        byPaymentMethod: [],
        byDepartment: [],
        topSpecialists: []
      }
    );
  },

  async getMonitoring() {
    const { data } = await api.get("/reports/monitoring");
    return (
      data.data || {
        health: {
          success: true,
          message: "",
          now: "",
          uptimeSec: 0,
          startedAt: "",
          dbState: "disconnected"
        },
        metrics: {
          errors5xxLast24h: 0,
          restartCountLast7d: 0
        },
        recentErrors: [],
        recentStartups: []
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
