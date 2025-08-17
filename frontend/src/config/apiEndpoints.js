const BASE =
  (process.env.REACT_APP_API_BASE || process.env.REACT_APP_API_BASE_URL || "http://localhost:8000")
    .replace(/\/+$/, "");

export const API_BASE = BASE;

export const ENDPOINTS = {
  CONTENT_RUN: "/content/run",          // POST (Form: script 문자열)
  VOICE_RUN:   "/analyze-voice",        // POST (Form: audio 파일 + script 문자열)
  EVALUATE:    "/evaluate",             // POST (JSON: { features: {...} })

  RES_SEG:     "/api/results/segments", // GET
  RES_PRE:     "/api/results/predicted",// GET
  RES_COR:     "/api/results/corrected" // GET
};
