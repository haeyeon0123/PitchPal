import axios from "axios";
import { API_BASE } from "@/config/apiEndpoints";

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 120_000,
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    const msg = err?.response?.data?.detail || err?.message || "요청 중 오류가 발생했습니다.";
    return Promise.reject(new Error(msg));
  }
);
