import { api } from "@/lib/api";
import { ENDPOINTS } from "@/config/apiEndpoints";

/**
 * POST /analyze-voice
 * - FormData: audio(파일, 필수), script(문자열, 선택)
 * wpm은 백엔드가 "WPM (Words Per Minute)"로 줄 수 있어서 표준화해서 반환
 */
export async function runSpeechAnalysis(audioFile, scriptText = "", onProgress) {
  const fd = new FormData();
  fd.append("audio", audioFile);
  fd.append("script", scriptText);

  const { data } = await api.post(ENDPOINTS.VOICE_RUN, fd, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (e) => {
      if (!onProgress || !e?.total) return;
      const pct = Math.round((e.loaded / e.total) * 100);
      onProgress(Math.min(99, Math.max(1, pct)));
    },
  });

  const wpmRaw = data?.["WPM (Words Per Minute)"] ?? data?.wpm ?? data?.precise_wpm;
  return {
    pronunciation_accuracy: data?.pronunciation_accuracy ?? data?.accuracy ?? null,
    pause_ratio:            data?.pause_ratio ?? null,
    filler_count:           data?.filler_count ?? data?.fillers ?? null,
    wpm:                    typeof wpmRaw === "number" ? wpmRaw : (wpmRaw ? Number(wpmRaw) : null),
    pitch_mean:             data?.pitch_mean ?? null,
    pitch_std:              data?.pitch_std ?? null,
    mfcc_mean:              data?.mfcc_mean ?? null,
    mfcc_std:               data?.mfcc_std ?? null,
    _raw: data
  };
}
