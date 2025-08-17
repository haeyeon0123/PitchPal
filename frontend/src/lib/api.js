// src/lib/api.js
import axios from 'axios';

/**
 * API_BASE 우선순위
 * 1) REACT_APP_API_BASE
 * 2) REACT_APP_API_BASE_URL
 * 3) window.__API_BASE__ (브라우저에서 전역 주입 시)
 * 4) 'http://localhost:8000' (로컬 FastAPI 기본값)
 */
export const API_BASE = (
  process.env.REACT_APP_API_BASE ||
  process.env.REACT_APP_API_BASE_URL ||
  (typeof window !== 'undefined' && window.__API_BASE__) ||
  'http://localhost:8000'
).replace(/\/+$/, ''); // 끝 슬래시 제거

// 공용 axios 인스턴스
export const api = axios.create({
  baseURL: API_BASE,
  timeout: 120_000, // 120초
  headers: { Accept: 'application/json' },
  withCredentials: false,
});

// 공통 에러 메시지 정규화
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const msg =
      err?.response?.data?.detail ||
      err?.message ||
      '요청 중 오류가 발생했습니다.';
    return Promise.reject(new Error(msg));
  }
);

// default와 named 둘 다 제공
export default api;
