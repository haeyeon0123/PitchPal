import { api } from "@/lib/api";
import { ENDPOINTS } from "@/config/apiEndpoints";

export const getSegmentsResults  = () => api.get(ENDPOINTS.RES_SEG).then(r => r.data);
export const getPredictedReport  = () => api.get(ENDPOINTS.RES_PRE).then(r => r.data);
export const getCorrectedResult  = () => api.get(ENDPOINTS.RES_COR).then(r => r.data);
