import api from "./api.js";

const authService = {
  async login(email, password) {
    const { data } = await api.post("/auth/login", { email, password });
    return data.data;
  }
};

export default authService;
