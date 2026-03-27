import axios from "axios";
import { storageKeys } from "../utils/constants.js";

const DEFAULT_PROD_API_HOST = "https://sampi-medline-back-v2.onrender.com";
const DEFAULT_DEV_API_HOST = "http://localhost:5000";

const rawApiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "").trim();
const apiHost =
  rawApiBaseUrl || (import.meta.env.PROD ? DEFAULT_PROD_API_HOST : DEFAULT_DEV_API_HOST);
const normalizedApiHost = apiHost.endsWith("/") ? apiHost.slice(0, -1) : apiHost;
const baseURL = normalizedApiHost.endsWith("/api")
  ? normalizedApiHost
  : `${normalizedApiHost}/api`;

const api = axios.create({
  baseURL,
  timeout: 60000
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(storageKeys.token);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      window.dispatchEvent(new Event("auth:unauthorized"));
    }

    const message =
      error.response?.data?.message ||
      (error.request
        ? "Network xatosi. Serverga ulanib bo'lmadi."
        : "Noma'lum xatolik yuz berdi.");

    return Promise.reject(new Error(message));
  }
);

export default api;
