// src/services/speechService.js

// ⛔️ '@/lib/api' 별칭 대신 ⭕️ 상대경로 사용
import api from '../lib/api';
import { ENDPOINTS } from '../config/apiEndpoints';

/** API 베이스 URL (절대경로 보정용) */
const API_BASE = (
  process.env.REACT_APP_API_BASE ||
  process.env.REACT_APP_API_BASE_URL ||
  'http://localhost:8000'
).replace(/\/+$/, '');

/** 상대 경로를 절대 URL로 보정 */
function toAbsoluteUrl(pathOrUrl) {
  if (!pathOrUrl) return null;
  try {
    const u = new URL(pathOrUrl);
    return u.href; // 이미 절대 URL
  } catch {
    return `${API_BASE}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
  }
}

/** 파일 업로드 전용 엔드포인트 안전가드 */
function getAnalyzePath() {
  // 프로젝트 설정에서 제공되면 우선 사용
  let p = ENDPOINTS?.SPEECH_ANALYZE || '/speech/analyze';

  // 혹시 잘못 evaluate 로 설정돼 있다면 교정
  if (/evaluate$/i.test(p)) p = '/speech/analyze';

  // 혹시 공백/오타 방지
  if (typeof p !== 'string' || !p.trim()) p = '/speech/analyze';
  return p;
}

/**
 * 음성분석 실행
 * POST /speech/analyze
 * - FormData: audio(파일, 필수), script(파일, 필수)
 * - onProgress: (pct:number) => void
 */
export async function runSpeechAnalysis(audioFile, scriptFile, onProgress) {
  if (!audioFile) throw new Error('audio 파일이 필요합니다.');
  if (!scriptFile) throw new Error('script(.txt) 파일이 필요합니다.');

  const fd = new FormData();
  fd.append('audio', audioFile);
  fd.append('script', scriptFile);

  const analyzePath = getAnalyzePath();

  try {
    const { data } = await api.post(analyzePath, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => {
        if (!onProgress || !e?.total) return;
        const pct = Math.round((e.loaded / e.total) * 100);
        onProgress(Math.min(99, Math.max(1, pct))); // 1~99%
      },
      timeout: 1000 * 60 * 5,
      // 업로드 중 413/422 등을 명확히 받기 위해 기본 validateStatus 유지
    });

    // wpm 키 호환 처리
    const wpmRaw =
      data?.wpm ??
      data?.precise_wpm ??
      data?.['WPM (Words Per Minute)'] ??
      null;

    const sttRel = data?.stt_results_url || null;

    return {
      pronunciation_accuracy: typeof data?.pronunciation_accuracy === 'number' ? data.pronunciation_accuracy : null,
      pause_ratio:            typeof data?.pause_ratio === 'number'            ? data.pause_ratio            : null,
      filler_count:           typeof data?.filler_count === 'number'           ? data.filler_count           : null,
      wpm:                    typeof wpmRaw === 'number' ? wpmRaw : (wpmRaw ? Number(wpmRaw) : null),

      pitch_mean: typeof data?.pitch_mean === 'number' ? data.pitch_mean : null,
      pitch_std:  typeof data?.pitch_std  === 'number' ? data.pitch_std  : null,
      mfcc_mean:  Array.isArray(data?.mfcc_mean) ? data.mfcc_mean : [],
      mfcc_std:   Array.isArray(data?.mfcc_std)  ? data.mfcc_std  : [],

      scores:   data?.scores && typeof data.scores === 'object' ? data.scores : {},
      segments: Array.isArray(data?.segments) ? data.segments : [],

      feedback_text: data?.feedback_text || '',
      stt_results_url: sttRel,                    // 상대 경로
      stt_results_abs_url: toAbsoluteUrl(sttRel), // 절대 URL

      analysis_mode: data?.analysis_mode || (scriptFile ? 'audio+script' : 'audio_only'),
      _raw: data,
    };
  } catch (err) {
    // Axios 에러 메시지 정규화
    const detail =
      err?.response?.data?.detail ??
      err?.response?.data?.message ??
      err?.message ??
      String(err);

    // 흔한 실수: 세그먼트 JSON 라우트로 보냈을 때의 Pydantic 에러
    if (/start_sec|end_sec|type=missing|pydantic/i.test(String(detail))) {
      throw new Error(
        '서버가 세그먼트 JSON을 요구하는 라우트로 요청이 간 것 같아요. ' +
        '서비스 레이어가 파일 업로드용 엔드포인트( /speech/run 또는 /speech/analyze )로 향하는지 확인해주세요.'
      );
    }

    // 413 Payload Too Large
    if (err?.response?.status === 413) {
      throw new Error('업로드한 파일 용량이 서버 제한을 초과했습니다. 더 작은 파일로 시도하거나 서버 설정을 늘려주세요.');
    }

    // CORS 또는 네트워크
    if (/(CORS|Network Error)/i.test(String(detail))) {
      throw new Error('네트워크/CORS 문제로 요청이 차단되었습니다. 백엔드 주소와 CORS 설정을 확인해주세요.');
    }

    // 기타
    throw new Error(typeof detail === 'string' ? detail : '요청 중 오류가 발생했습니다.');
  }
}

export function finishProgress(publish) {
  if (typeof publish === 'function') publish(100);
}

export { toAbsoluteUrl, API_BASE };
