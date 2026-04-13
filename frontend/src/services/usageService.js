import api from "./api.js";

const createIdempotencyKey = (prefix = "checkout") => {
  const randomPart =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${randomPart}`;
};

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
    const { data } = await api.post("/usage/checkout", payload, {
      headers: {
        "X-Idempotency-Key": createIdempotencyKey("nurse")
      }
    });
    return data.data;
  },

  async createLorCheckout(payload) {
    const { data } = await api.post("/usage/lor-checkout", payload, {
      headers: {
        "X-Idempotency-Key": createIdempotencyKey("lor")
      }
    });
    return data.data;
  },

  async getRoleSpecialists(search = "") {
    const params = new URLSearchParams();
    if (search?.trim()) {
      params.set("search", search.trim());
    }
    const query = params.toString() ? `?${params.toString()}` : "";
    const { data } = await api.get(`/usage/specialists${query}`);
    return data.data || [];
  },

  async createRoleSpecialist(payload) {
    const { data } = await api.post("/usage/specialists", payload);
    return data.data;
  },

  async updateRoleSpecialist(id, payload) {
    const { data } = await api.patch(`/usage/specialists/${id}`, payload);
    return data.data;
  },

  async deleteRoleSpecialist(id) {
    const { data } = await api.delete(`/usage/specialists/${id}`);
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
