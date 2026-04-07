import api from "./api.js";

const buildQuery = ({
  date,
  department = "all",
  specialistType = "all",
  paymentMethod = "all",
  debtOnly = false,
  search = "",
  timeScope = "all"
}) => {
  const params = new URLSearchParams();
  if (date) params.set("date", date);
  if (department) params.set("department", department);
  if (specialistType) params.set("specialistType", specialistType);
  if (paymentMethod) params.set("paymentMethod", paymentMethod);
  if (timeScope) params.set("timeScope", timeScope);
  if (debtOnly) params.set("debtOnly", "true");
  if (search?.trim()) params.set("search", search.trim());
  const query = params.toString();
  return query ? `?${query}` : "";
};

const cashierService = {
  async getEntries(filters = {}) {
    const { data } = await api.get(`/cashier/entries${buildQuery(filters)}`);
    return data.data;
  },

  async getSummary(filters = {}) {
    const { data } = await api.get(`/cashier/summary${buildQuery(filters)}`);
    return data.data;
  },

  async getSpecialists({ type = "all", search = "" } = {}) {
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (search?.trim()) params.set("search", search.trim());
    const query = params.toString() ? `?${params.toString()}` : "";
    const { data } = await api.get(`/cashier/specialists${query}`);
    return data.data || [];
  },

  async createSpecialist(payload) {
    const { data } = await api.post("/cashier/specialists", payload);
    return data.data;
  },

  async deleteSpecialist(specialistId) {
    const { data } = await api.delete(`/cashier/specialists/${specialistId}`);
    return data.data;
  },

  async createEntry(payload) {
    const { data } = await api.post("/cashier/entries", payload);
    return data.data;
  },

  async updateEntry(entryId, payload) {
    const { data } = await api.patch(`/cashier/entries/${entryId}`, payload);
    return data.data;
  },

  async deleteEntry(entryId) {
    const { data } = await api.delete(`/cashier/entries/${entryId}`);
    return data.data;
  }
};

export default cashierService;
