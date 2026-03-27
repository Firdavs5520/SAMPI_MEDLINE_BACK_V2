import api from "./api.js";

const usageService = {
  async useMedicine(payload) {
    const { data } = await api.post("/usage/medicine", payload);
    return data.data;
  },

  async useService(payload) {
    const { data } = await api.post("/usage/service", payload);
    return data.data;
  },

  async createCheckout(payload) {
    const { data } = await api.post("/usage/checkout", payload);
    return data.data;
  },

  async getMyChecks(search = "", lorIdentity = "") {
    const params = new URLSearchParams();
    if (search?.trim()) {
      params.set("q", search.trim());
    }
    if (lorIdentity?.trim()) {
      params.set("lorIdentity", lorIdentity.trim().toLowerCase());
    }
    const query = params.toString() ? `?${params.toString()}` : "";
    const { data } = await api.get(`/usage/my-checks${query}`);
    return data.data || [];
  }
};

export default usageService;
