import api from "./api.js";

const medicineService = {
  async getAllMedicines() {
    const { data } = await api.get("/medicines");
    return data.data || [];
  },

  async addMedicine(payload) {
    const { data } = await api.post("/medicines", payload);
    return data.data;
  },

  async increaseStock(medicineId, quantity) {
    const { data } = await api.patch(`/medicines/${medicineId}/increase`, {
      quantity
    });
    return data.data;
  },

  async updateStock(medicineId, stock) {
    const { data } = await api.patch(`/medicines/${medicineId}/stock`, {
      stock
    });
    return data.data;
  }
};

export default medicineService;
