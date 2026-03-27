import api from "./api.js";

const serviceService = {
  async getAllServices() {
    const { data } = await api.get("/services");
    return data.data || [];
  },

  async createService(payload) {
    const { data } = await api.post("/services", payload);
    return data.data;
  }
};

export default serviceService;
