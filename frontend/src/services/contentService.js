import { api } from "@/lib/api";
import { ENDPOINTS } from "@/config/apiEndpoints";

/**
 * POST /content/run
 * - FormData: script (문자열)
 * 파일을 올려도 서버는 "문자열"을 기대하므로, 파일이면 .text()로 변환해서 보냄
 */
export async function runContentAnalysis(scriptInput) {
  const fd = new FormData();

  if (scriptInput instanceof File) {
    const text = await scriptInput.text();
    fd.append("script", text);
  } else {
    fd.append("script", String(scriptInput ?? ""));
  }

  const { data } = await api.post(ENDPOINTS.CONTENT_RUN, fd);
  return {
    html_url:         data?.html_url,
    original_text:    data?.original_text,
    corrected_text:   data?.corrected_text,
    highlighted_html: data?.highlighted_html,
    feedback_text:    data?.feedback_text,
    meta:             data?.meta ?? {}
  };
}
