// src/services/speechService.js

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
  let p = ENDPOINTS?.SPEECH_ANALYZE || '/speech/analyze';
  if (/evaluate$/i.test(p)) p = '/speech/analyze';
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

  // ✅ 절대 URL로 강제 (상대경로로 3000번에 가는 문제 방지)
  const url = toAbsoluteUrl(getAnalyzePath());

  try {
    const { data, headers } = await api.post(url, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => {
        if (!onProgress || !e?.total) return;
        const pct = Math.round((e.loaded / e.total) * 100);
        onProgress(Math.min(99, Math.max(1, pct))); // 1~99%
      },
      timeout: 1000 * 60 * 5,
    });

    // 응답이 HTML로 오는 경우(라우팅/경로 문제) 방지
    const ct = (headers?.['content-type'] || headers?.['Content-Type'] || '');
    if (!ct.includes('application/json') && typeof data === 'string' && /<!doctype html>/i.test(data)) {
      throw new Error('Expected JSON, got HTML. API_BASE 또는 엔드포인트 경로를 확인하세요.');
    }

    // ---- 키 호환 처리 (여러 백엔드 버전 지원) ----
    const wpmRaw =
      data?.wpm ??
      data?.precise_wpm ??
      data?.['WPM (Words Per Minute)'] ??
      null;

    // ✅ Pitch/MFCC 전역 통계: 한글 키를 그대로 보존 + 대안 키도 병합
    const pitchMeanTop = (
      data?.['Pitch 평균'] ??
      data?.avg_pitch_mean ??
      data?.pitch_mean ??
      null
    );
    const pitchStdTop = (
      data?.['Pitch 표준편차'] ??
      data?.avg_pitch_std ??
      data?.pitch_std ??
      null
    );

    const mfccMeanVec = (
      Array.isArray(data?.['MFCC 평균']) ? data['MFCC 평균'] :
      Array.isArray(data?.mfcc_mean)     ? data.mfcc_mean     :
      []
    );
    const mfccStdVec = (
      Array.isArray(data?.['MFCC 표준편차']) ? data['MFCC 표준편차'] :
      Array.isArray(data?.mfcc_std)          ? data.mfcc_std          :
      []
    );

    // 서비스 레이어 반환: 프론트 mapServiceToUi에서 그대로 읽게 함
    const out = {
      pronunciation_accuracy: typeof data?.pronunciation_accuracy === 'number' ? data.pronunciation_accuracy : null,
      pause_ratio:            typeof data?.pause_ratio === 'number'            ? data.pause_ratio            : (typeof data?.['무음 구간 비율'] === 'number' ? data['무음 구간 비율'] : null),
      filler_count:           typeof data?.filler_count === 'number'           ? data.filler_count           : (typeof data?.['간투사 수'] === 'number' ? data['간투사 수'] : null),
      wpm:                    typeof wpmRaw === 'number' ? wpmRaw : (wpmRaw ? Number(wpmRaw) : null),

      // 🔴 여기가 핵심: 한글 키를 그대로 보존해서 상위로 전달
      ['Pitch 평균']:      (typeof pitchMeanTop === 'number' ? pitchMeanTop : null),
      ['Pitch 표준편차']:  (typeof pitchStdTop  === 'number' ? pitchStdTop  : null),
      ['MFCC 평균']:       mfccMeanVec,
      ['MFCC 표준편차']:   mfccStdVec,

      // 기존 필드 유지
      pitch_mean: (typeof data?.pitch_mean === 'number' ? data.pitch_mean : null),
      pitch_std:  (typeof data?.pitch_std  === 'number' ? data.pitch_std  : null),
      mfcc_mean:  mfccMeanVec,
      mfcc_std:   mfccStdVec,

      scores:   data?.scores && typeof data.scores === 'object' ? data.scores : {},
      segments: Array.isArray(data?.segments) ? data.segments : [],

      feedback_text: data?.feedback_text || '',
      stt_results_url: data?.stt_result_url || data?.stt_results_url || null,
      stt_results_abs_url: toAbsoluteUrl(data?.stt_result_url || data?.stt_results_url || null),

      analysis_mode: data?.analysis_mode || (scriptFile ? 'audio+script' : 'audio_only'),
      _raw: data,
    };

    return out;
  } catch (err) {
    const detail =
      err?.response?.data?.detail ??
      err?.response?.data?.message ??
      err?.message ??
      String(err);

    if (/start_sec|end_sec|type=missing|pydantic/i.test(String(detail))) {
      throw new Error(
        '서버가 세그먼트 JSON을 요구하는 라우트로 요청이 간 것 같아요. ' +
        '서비스 레이어가 파일 업로드용 엔드포인트( /speech/analyze )로 향하는지 확인해주세요.'
      );
    }

    if (err?.response?.status === 413) {
      throw new Error('업로드한 파일 용량이 서버 제한을 초과했습니다. 더 작은 파일로 시도하거나 서버 설정을 늘려주세요.');
    }

    if (/(CORS|Network Error)/i.test(String(detail))) {
      throw new Error('네트워크/CORS 문제로 요청이 차단되었습니다. 백엔드 주소와 CORS 설정을 확인해주세요.');
    }

    throw new Error(typeof detail === 'string' ? detail : '요청 중 오류가 발생했습니다.');
  }
}

export function finishProgress(publish) {
  if (typeof publish === 'function') publish(100);
}

export { toAbsoluteUrl, API_BASE };
