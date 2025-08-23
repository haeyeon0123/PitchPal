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

/** 파일 업로드 전용 엔드포인트 안전가드 (구버전 폴백용) */
function getAnalyzePath() {
  let p = ENDPOINTS?.SPEECH_ANALYZE || '/speech/analyze';
  if (/evaluate$/i.test(p)) p = '/speech/analyze';
  if (typeof p !== 'string' || !p.trim()) p = '/speech/analyze';
  return p;
}

/** 새 파이프라인 엔드포인트 */
const SPEECH_START = '/speech/start';
const SPEECH_PROGRESS = (id) => `/speech/progress/${id}`;
const SPEECH_RESULT = (id) => `/speech/result/${id}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 내부: 백엔드 표준 응답 → 프론트 서비스 출력 형태로 매핑 */
function mapSpeechResponse(data, scriptFile) {
  // ---- 키 호환 처리 ----
  const wpmRaw =
    data?.wpm ??
    data?.precise_wpm ??
    data?.['WPM (Words Per Minute)'] ??
    null;

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

  return {
    pronunciation_accuracy: typeof data?.pronunciation_accuracy === 'number' ? data.pronunciation_accuracy : null,
    pause_ratio:            typeof data?.pause_ratio === 'number'            ? data.pause_ratio            : (typeof data?.['무음 구간 비율'] === 'number' ? data['무음 구간 비율'] : null),
    filler_count:           typeof data?.filler_count === 'number'           ? data.filler_count           : (typeof data?.['간투사 수'] === 'number' ? data['간투사 수'] : null),
    wpm:                    typeof wpmRaw === 'number' ? wpmRaw : (wpmRaw ? Number(wpmRaw) : null),

    // 한글 키 보존
    ['Pitch 평균']:      (typeof pitchMeanTop === 'number' ? pitchMeanTop : null),
    ['Pitch 표준편차']:  (typeof pitchStdTop  === 'number' ? pitchStdTop  : null),
    ['MFCC 평균']:       mfccMeanVec,
    ['MFCC 표준편차']:   mfccStdVec,

    // 영문 키도 유지
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
}

/**
 * 음성분석 실행 (신규 비동기 파이프라인 사용, 구버전 자동 폴백)
 * - onProgress(pct:number, status?:string)
 */
export async function runSpeechAnalysis(audioFile, scriptFile, onProgress) {
  if (!audioFile) throw new Error('audio 파일이 필요합니다.');
  if (!scriptFile) throw new Error('script(.txt) 파일이 필요합니다.');

  const fd = new FormData();
  fd.append('audio', audioFile);
  fd.append('script', scriptFile);

  // 1) 먼저 새 파이프라인 시도: /speech/start
  try {
    const startUrl = toAbsoluteUrl(SPEECH_START);
    const startRes = await api.post(startUrl, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      // 업로드 진행률 표시 (0~40% 구간 사용)
      onUploadProgress: (e) => {
        if (!onProgress || !e?.total) return;
        const pct = Math.round((e.loaded / e.total) * 40); // 업로드 0~40%
        onProgress(Math.min(40, Math.max(1, pct)), 'uploading');
      },
      // 오래 걸릴 수 있으므로 무제한
      timeout: 0,
    });

    const jobId = startRes?.data?.job_id;
    if (!jobId) throw new Error('job_id를 받지 못했습니다.');

    // 2) progress 폴링
    let status = 'queued';
    let lastPct = 40;
    while (status !== 'done' && status !== 'error') {
      await sleep(1500);
      const progUrl = toAbsoluteUrl(SPEECH_PROGRESS(jobId));
      const progRes = await api.get(progUrl, { timeout: 0 });
      const pct = Number(progRes?.data?.progress ?? lastPct);
      status = String(progRes?.data?.status || 'running');

      // 진행률: 40~95% 사이에서 반영
      const mapped = Math.max(40, Math.min(95, pct));
      lastPct = mapped;
      if (onProgress) onProgress(mapped, status);
    }

    if (status === 'error') {
      throw new Error('음성 분석 파이프라인 오류');
    }

    if (onProgress) onProgress(97, 'fetching_result');

    // 3) result 조회 (202면 다시 폴링)
    const resultUrl = toAbsoluteUrl(SPEECH_RESULT(jobId));
    let data;
    for (let i = 0; i < 20; i++) {
      try {
        const res = await api.get(resultUrl, { timeout: 0 });
        data = res.data;
        break;
      } catch (err) {
        if (err?.response?.status === 202) {
          await sleep(1200);
          continue;
        }
        throw err;
      }
    }
    if (!data) throw new Error('결과를 가져오지 못했습니다.');

    if (onProgress) onProgress(100, 'done');
    return mapSpeechResponse(data, scriptFile);
  } catch (err) {
    // 새 파이프라인 엔드포인트가 없거나(404/405) 실패하면 구버전으로 폴백
    const code = err?.response?.status;
    const msg = String(err?.message || err);
    const retriable = code === 404 || code === 405 || /not found|unknown route/i.test(msg);

    if (!retriable) {
      // 다른 오류면 그대로 던짐
      throw normalizeError(err);
    }
  }

  // 4) 구버전 폴백: /speech/analyze (동기)
  const url = toAbsoluteUrl(getAnalyzePath());
  try {
    const { data, headers } = await api.post(url, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => {
        if (!onProgress || !e?.total) return;
        const pct = Math.round((e.loaded / e.total) * 95);
        onProgress(Math.min(95, Math.max(1, pct)), 'uploading');
      },
      // 구버전은 오래 걸릴 수 있으므로 무제한 권장
      timeout: 0,
    });

    const ct = (headers?.['content-type'] || headers?.['Content-Type'] || '');
    if (!ct.includes('application/json') && typeof data === 'string' && /<!doctype html>/i.test(data)) {
      throw new Error('Expected JSON, got HTML. API_BASE 또는 엔드포인트 경로를 확인하세요.');
    }

    if (onProgress) onProgress(100, 'done');
    return mapSpeechResponse(data, scriptFile);
  } catch (err) {
    throw normalizeError(err);
  }
}

/** 최종 100% 보정 */
export function finishProgress(publish) {
  if (typeof publish === 'function') publish(100);
}

/** 에러 메시지 표준화 */
function normalizeError(err) {
  const detail =
    err?.response?.data?.detail ??
    err?.response?.data?.message ??
    err?.message ??
    String(err);

  if (/start_sec|end_sec|type=missing|pydantic/i.test(String(detail))) {
    return new Error(
      '서버가 세그먼트 JSON을 요구하는 라우트로 요청이 간 것 같아요. ' +
      '서비스 레이어가 파일 업로드용 엔드포인트로 향하는지 확인해주세요.'
    );
  }

  if (err?.response?.status === 413) {
    return new Error('업로드한 파일 용량이 서버 제한을 초과했습니다. 더 작은 파일로 시도하거나 서버 설정을 늘려주세요.');
  }

  if (/(CORS|Network Error)/i.test(String(detail))) {
    return new Error('네트워크/CORS 문제로 요청이 차단되었습니다. 백엔드 주소와 CORS 설정을 확인해주세요.');
  }

  return new Error(typeof detail === 'string' ? detail : '요청 중 오류가 발생했습니다.');
}

export { toAbsoluteUrl, API_BASE };
