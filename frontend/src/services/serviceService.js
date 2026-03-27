import api from "./api.js";

const serviceService = {
  async getAllServices() {
    const { data } = await api.get("/services");
    return data.data || [];
  },

  async createService(payload) {
    const { data } = await api.post("/services", payload);
    return data.data;
  },

  async updateService(serviceId, payload) {
    const { data } = await api.patch(`/services/${serviceId}`, payload);
    return data.data;
  },

  async deleteService(serviceId) {
    const { data } = await api.delete(`/services/${serviceId}`);
    return data.data;
  }
};

export default serviceService;
