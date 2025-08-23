// 음성 분석 페이지

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceArea, ReferenceLine,
  BarChart, Bar,
  AreaChart, Area,
} from 'recharts';
import {
  CheckCircle, PauseCircle, Slash, Volume2, Activity, Mic, AudioLines, ExternalLink,
  Lightbulb
} from 'lucide-react';

import { runSpeechAnalysis } from '../services/speechService';
import { API_BASE } from '../config/apiEndpoints';

// ====== 브랜드 컬러 ======
const COLOR_PRIMARY   = '#5686C4';
const COLOR_SECONDARY = '#826BC6';
const COLOR_ACCENT    = '#3EB489';
// 업로드 박스의 "분석 시작" 버튼은 요청사항대로 #6EAED5 사용
const BUTTON_PRIMARY  = '#6EAED5';

/* ======================= 유틸/더미 ======================= */
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const mean = (a) => (a && a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

const midSec = (range, idx, step = 5) => {
  if (!range) return idx * step + step / 2;
  const [s, e] = String(range).split(/[-~]/).map(t => parseFloat(t.replace(/[^\d.]/g, '')));
  if (Number.isFinite(s) && Number.isFinite(e)) return (Math.min(s, e) + Math.max(s, e)) / 2;
  return idx * step + step / 2;
};

const parseTimeRange = (rangeStr) => {
  if (!rangeStr) return { start: 0, end: 0 };
  const [s, e] = String(rangeStr).split(/[-~]/).map(t => parseFloat(t.replace(/[^\d.]/g, '')));
  return { start: Math.min(s || 0, e || 0), end: Math.max(s || 0, e || 0) };
};

const playSegment = (audioRef, startSec, endSec) => {
  const audio = audioRef?.current;
  if (!audio) return;
  audio.pause();
  audio.currentTime = Math.max(0, startSec);
  audio.play();
  const handler = () => {
    if (audio.currentTime >= endSec) {
      audio.pause();
      audio.removeEventListener('timeupdate', handler);
    }
  };
  audio.addEventListener('timeupdate', handler);
};

// 5초 단위 더미 데이터 (응답 비어있을 때 가드용)
const DUMMY_SEGMENTS = Array.from({ length: 12 }, (_, i) => ({
  time_range: `${(i * 5).toFixed(2)}-${((i + 1) * 5).toFixed(2)}`,
  wpm: 120 + Math.sin(i * 0.6) * 15 + (i % 5 === 3 ? 25 : 0),
  pitch_mean: 180 + Math.cos(i * 0.5) * 20 + (i % 7 === 4 ? -30 : 0),
  mfcc_mean: Array.from({ length: 13 }, (_, k) => 10 + Math.sin(i * 0.5 + k * 0.2) * 2),
  fillers: [],
  silence: []
}));
const DUMMY_FILLERS = [
  { time_sec: 11, word: "어", duration: 0.3 },
  { time_sec: 26, word: "음", duration: 0.4 },
  { time_sec: 47, word: "그", duration: 0.2 },
];
const DUMMY_SILENCE = [
  { start_sec: 15, end_sec: 18 },
  { start_sec: 41, end_sec: 44 },
];

// === KPI value helpers ===
const pickNum = (...cands) => {
  for (const v of cands) if (Number.isFinite(v)) return v;
  return null;
};
const avgOf = (arr) =>
  Array.isArray(arr) && arr.length
    ? arr.reduce((s, x) => s + Number(x || 0), 0) / arr.length
    : null;

const getPitchTuple = (r) => ({
  mean: pickNum(r?.["Pitch 평균"], r?.kpi?.pitch_mean, r?.pitch_mean),
  std:  pickNum(r?.["Pitch 표준편차"], r?.kpi?.pitch_std, r?.pitch_std),
});

const getMFCCAvgTuple = (r) => {
  const meanVec = r?.["MFCC 평균"] ?? r?.kpi?.mfcc_mean ?? r?.mfcc_mean;
  const stdVec  = r?.["MFCC 표준편차"] ?? r?.kpi?.mfcc_std ?? r?.mfcc_std;
  return { mean: avgOf(meanVec), std: avgOf(stdVec) };
};


/* ======================= 공용 UI 컴포넌트 ======================= */
function SectionTitle({ icon, title, hint }) {
  return (
    <div className="flex items-center gap-2 mb-1">
      <div className="w-5 h-5" style={{ color: COLOR_PRIMARY }}>{icon}</div>
      <h3 className="text-lg font-semibold">{title}</h3>
      {hint && <span title={hint} className="ml-1 text-xs text-gray-500 cursor-help">ⓘ</span>}
    </div>
  );
}

function SectionHeader({ number = "①", title, hint }) {
  return (
    <header className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span
          className="inline-flex items-center justify-center w-6 h-6 text-xs font-semibold rounded-full text-white"
          style={{ backgroundColor: COLOR_SECONDARY }}
        >
          {number}
        </span>
        <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
      </div>
      {hint && <span className="inline-flex items-center gap-1 text-xs text-gray-500">ⓘ {hint}</span>}
    </header>
  );
}

/* ==== NEW: 침묵/간투사 카드 ==== */
function SilenceCard({ ratioPercent = 0 }) {
  const pct = Math.max(0, Math.min(100, Number(ratioPercent)));
  return (
  <div className="p-4 rounded-2xl bg-white shadow-sm border border-gray-100 flex flex-col">
    <div className="flex items-center justify-between mb-2">
      <h5 className="font-semibold">침묵 비율</h5>
      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-50 text-gray-500 border border-gray-200">
        Silence
      </span>
    </div>

    <div className="flex items-baseline gap-2">
      <span className="text-3xl font-bold" style={{ color: COLOR_PRIMARY }}>
        {pct.toFixed(1)}%
      </span>
      <span className="text-sm text-gray-500">전체 발화 중</span>
    </div>

    <div
      className="mt-3 h-2 w-full bg-gray-100 rounded-full overflow-hidden"
      aria-hidden
    >
      <div
        className="h-full rounded-full"
        style={{ width: `${pct}%`, backgroundColor: COLOR_PRIMARY }}
      />
    </div>

    {/* 설명문구: 카드 맨 아래 고정 */}
    <p className="text-xs text-gray-600 mt-auto pt-2">
      긴 침묵은 줄이고, 짧게 멈추면 좋아요.
    </p>
  </div>
);
}

function FillerCard({ items = [] }) {
  const total = items.reduce((s, it) => s + Number(it.count || 0), 0);
  return (
    <div className="p-4 rounded-2xl bg-white shadow-sm border border-gray-100 flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <h5 className="font-semibold">간투사 사용</h5>
        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-50 text-gray-500 border border-gray-200">
          Fillers
        </span>
      </div>

      {/* 총 사용 숫자와 '회' 통일 */}
      <div className="flex items-end gap-2 mb-2">
        <span className="text-3xl font-bold" style={{ color: COLOR_SECONDARY }}>
          {total}회
        </span>
        <span className="text-sm text-gray-500">총 사용</span>
      </div>

      {items.length ? (
        <ul className="divide-y divide-gray-100">
          {items.map((it, i) => (
            <li key={`${it.word}-${i}`} className="py-1.5 text-sm flex justify-between">
              <span className="text-gray-700">{it.word}</span>
              <span className="font-medium" style={{ color: COLOR_SECONDARY }}>
                {it.count}회
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-sm text-gray-500">간투사 없음 🎉</div>
      )}

      {/* 고정 멘트: 카드 하단 */}
      <p className="text-xs text-gray-600 mt-auto pt-2">
        간투사를 줄이면 메시지가 더 명확해져요.
      </p>
    </div>
  );
}

/* ======================= API → UI 매핑 (service 응답 표준) ======================= */
/**
 * 백엔드(/speech/analyze 또는 /speech/result) 응답 → 이 페이지에서 쓰는 형태로 변환
 */
function mapServiceToUi(api) {
  // ---------- 헬퍼 ----------
  const normProb = (v) => {
    const x = Number(v ?? 0);
    if (!Number.isFinite(x)) return 0;
    // 0~1 또는 0~100 대응
    return x > 1.5 ? x / 100 : x;
  };
  const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
  const mean = (a) => (a && a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

  // ---------- 기본 KPI (영문/한글 키 모두 수용) ----------
  const pronunciation_accuracy = normProb(
    api?.pronunciation_accuracy ?? api?.["Pronunciation Accuracy"] ?? api?.발음_유사도_점수
  );

  const wpm = Number(
    api?.wpm ?? api?.WPM ?? 0
  );

  const pause_ratio = Number(
    api?.pause_ratio ?? api?.["Pause Ratio"] ?? api?.무음_구간_비율 ?? 0
  );

  // ✅ 간투사 총합: filler.total > filler_count > "Filler Count"
  const filler_count = Number(
    (api?.filler && typeof api.filler.total !== 'undefined' ? api.filler.total : undefined)
    ?? api?.filler_count
    ?? api?.["Filler Count"]
    ?? api?.간투사_수
    ?? 0
  );

  // ---------- 세그먼트/타임라인 ----------
  const segIn = Array.isArray(api?.segments) ? api.segments : [];
  const pitchTL = Array.isArray(api?.pitch_timeline) ? api.pitch_timeline : [];
  const mfccMeanGlobal =
    Array.isArray(api?.mfcc_mean) ? api.mfcc_mean :
    Array.isArray(api?.["MFCC Mean"]) ? api["MFCC Mean"] : [];

  const parseTimeRange = (rangeStr) => {
    if (!rangeStr) return { start: 0, end: 0 };
    const [s, e] = String(rangeStr).split(/[-~]/).map(t => parseFloat(t.replace(/[^\d.]/g, '')));
    return { start: Math.min(s || 0, e || 0), end: Math.max(s || 0, e || 0) };
  };
  const segments = segIn.length
    ? segIn.map((s) => {
        const start = Number(s.start_sec ?? s.start ?? parseTimeRange(s.time_range ?? '').start ?? 0);
        const end   = Number(s.end_sec   ?? s.end   ?? parseTimeRange(s.time_range ?? '').end   ?? 0);
        // 세그먼트 피치 평균 추정
        const inRange = pitchTL.filter(p => Number(p.t) >= start && Number(p.t) <= end).map(p => Number(p.value));
        let pitch_mean;
        if (inRange.length) pitch_mean = mean(inRange);
        else if (pitchTL.length) {
          const mid = (start + end) / 2;
          const nearest = pitchTL.reduce((best, cur) => {
            const d = Math.abs(Number(cur.t) - mid);
            return d < best.dist ? { dist: d, v: Number(cur.value) } : best;
          }, { dist: Infinity, v: 0 });
          pitch_mean = nearest.v;
        } else { // 타임라인이 없으면 전역 평균으로라도
          pitch_mean = Number(api?.pitch_mean ?? api?.["Pitch Mean"] ?? s.pitch_mean ?? 0);
        }
        return {
          time_range: `${start.toFixed(2)}-${end.toFixed(2)}`,
          wpm: Number(s.wpm ?? 0),
          pitch_mean,
          mfcc_mean: Array.isArray(s.mfcc_mean) ? s.mfcc_mean : mfccMeanGlobal,
          fillers: s.fillers ?? [],
          silence: s.silence ?? [],
        };
      })
    : Array.from({ length: 12 }, (_, i) => ({
        time_range: `${(i * 5).toFixed(2)}-${((i + 1) * 5).toFixed(2)}`,
        wpm: 120 + Math.sin(i * 0.6) * 15 + (i % 5 === 3 ? 25 : 0),
        pitch_mean: 180 + Math.cos(i * 0.5) * 20 + (i % 7 === 4 ? -30 : 0),
        mfcc_mean: Array.from({ length: 13 }, (_, k) => 10 + Math.sin(i * 0.5 + k * 0.2) * 2),
        fillers: [],
        silence: []
      }));

  // ---------- 침묵/간투사 (영문 키 흡수) ----------
  const silence = Array.isArray(api?.silence) ? api.silence.map(iv => ({
    start_sec: Number(iv.start_sec ?? iv.start ?? 0),
    end_sec:   Number(iv.end_sec   ?? iv.end   ?? 0),
  })) : [];

  let fillers = [];
  const occ = Array.isArray(api?.filler?.occurrences) ? api.filler.occurrences : null;

  if (occ && occ.length) {
    fillers = occ.map(o => {
      if (Number.isFinite(o?.time)) {
        return { time_sec: Number(o.time), word: String(o.type ?? o.word ?? 'F') };
      }
      const s = Number(o?.start ?? o?.start_sec), e = Number(o?.end ?? o?.end_sec ?? o?.start ?? o?.start_sec);
      if (Number.isFinite(s) && Number.isFinite(e)) {
        return { time_sec: (s + e) / 2, word: String(o.type ?? o.word ?? 'F') };
      }
      return null;
    }).filter(Boolean);
  } else if (Array.isArray(api?.fillers) && api.fillers.length) {
    fillers = api.fillers
      .map(f => {
        const t = Number(f.time ?? f.time_sec ?? (Number.isFinite(f.start_sec) && Number.isFinite(f.end_sec) ? (f.start_sec + f.end_sec)/2 : NaN));
        return Number.isFinite(t) ? { time_sec: t, word: f.token ?? f.word ?? 'F' } : null;
      })
      .filter(Boolean);
  } else if (Array.isArray(api?.["Filler Words"]) && api["Filler Words"].length) {
    // ✅ total_temp.py: [ (word, start, end), ... ]
    fillers = api["Filler Words"]
      .map(t => Array.isArray(t) && t.length >= 3
        ? { time_sec: (Number(t[1]) + Number(t[2])) / 2, word: String(t[0]) }
        : null)
      .filter(Boolean);
  }

  // 유형별 집계
  let fillerByType = null;
  if (api?.filler?.by_type && typeof api.filler.by_type === 'object') {
    fillerByType = Object.entries(api.filler.by_type).map(([word, count]) => ({ word, count: Number(count || 0) }));
  } else if (Array.isArray(api?.fillers_by_type)) { // 혹시 배열 형태라면
    fillerByType = api.fillers_by_type.map(x => ({ word: String(x.word), count: Number(x.count || 0) }));
  } else if (fillers.length) {
    const m = new Map();
    fillers.forEach(f => m.set(String(f.word), (m.get(String(f.word)) || 0) + 1));
    fillerByType = Array.from(m, ([word, count]) => ({ word, count }));
  }

  // ---------- 레이더 점수 ----------
  const pitchVals = pitchTL.map(p => Number(p.value)).filter(Number.isFinite);
  const pitchStdFromTL = (() => {
    if (pitchVals.length < 2) return 0;
    const m = mean(pitchVals);
    const v = mean(pitchVals.map(v => (v - m) ** 2));
    return Math.sqrt(v);
  })();

  // 전역 피치/음색(영문 키)도 확보
  const _pitchMeanTop = Number(api?.["Pitch 평균"] ?? api?.avg_pitch_mean ?? api?.pitch_mean ?? api?.["Pitch Mean"] ?? NaN);
  const _pitchStdTop  = Number(api?.["Pitch 표준편차"] ?? api?.avg_pitch_std ?? api?.pitch_std ?? api?.["Pitch Std"]  ?? NaN);
  const _mfccMeanVec  = Array.isArray(api?.["MFCC 평균"]) ? api["MFCC 평균"]
                        : Array.isArray(api?.mfcc_mean)    ? api.mfcc_mean
                        : Array.isArray(api?.["MFCC Mean"]) ? api["MFCC Mean"] : [];
  const _mfccStdVec   = Array.isArray(api?.["MFCC 표준편차"]) ? api["MFCC 표준편차"]
                        : Array.isArray(api?.mfcc_std)          ? api.mfcc_std
                        : Array.isArray(api?.["MFCC Std"])       ? api["MFCC Std"] : [];

  let intonation5 = clamp((pitchStdFromTL / 80) * 5, 0, 5);
  if ((!Number.isFinite(pitchStdFromTL) || pitchStdFromTL === 0) && Number.isFinite(_pitchStdTop)) {
    // 타임라인이 없을 때 전역 표준편차로 대체
    intonation5 = clamp((_pitchStdTop / 80) * 5, 0, 5);
  }

  const mfccStdAvg = _mfccStdVec.length ? mean(_mfccStdVec.map(Math.abs)) : 0;
  const speed5  = (() => {
    if (!Number.isFinite(wpm) || wpm <= 0) return 0;
    const target = 120, sigma = 40;
    const z = Math.exp(-((wpm - target) ** 2) / (2 * sigma ** 2));
    return clamp(z * 5, 0, 5);
  })();
  const filler5 = clamp((10 - Math.min(10, filler_count)) / 10 * 5, 0, 5);
  const pause5  = clamp((1 - pause_ratio) * 5, 0, 5);
  const mfcc5   = clamp((50 - Math.min(50, mfccStdAvg)) / 50 * 5, 0, 5);

  // ---------- 반환(한글/영문 키 모두 제공) ----------
  return {
    scores: {
      pronunciation: clamp(pronunciation_accuracy * 5, 0, 5),
      intonation:    intonation5,
      speed:         speed5,
      filler:        filler5,
      pause:         pause5,
      mfcc:          mfcc5,
    },
    features: { pronunciation_accuracy, wpm, filler_count, pause_ratio },

    feedback: api?.feedback_text || api?.feedback || "분석 결과를 불러왔습니다. 상세 항목을 확인해 보세요.",
    feedback_bullets: Array.isArray(api?.feedback_bullets) ? api.feedback_bullets : [],
    stt_html_url: api?.stt_result_url || api?.stt_results_url || null,

    segments,
    _globalSilence: silence,
    _globalFillers: fillers,
    _fillerByType: fillerByType,

    // KPI 블록 (프론트 다른 카드와의 호환 위해 한글 키도 심어둠)
    kpi: {
      pitch_mean: Number.isFinite(_pitchMeanTop) ? _pitchMeanTop : null,
      pitch_std:  Number.isFinite(_pitchStdTop)  ? _pitchStdTop  : null,
      mfcc_mean:  _mfccMeanVec,
      mfcc_std:   _mfccStdVec,
    },
    ["Pitch 평균"]:     Number.isFinite(_pitchMeanTop) ? _pitchMeanTop : null,
    ["Pitch 표준편차"]: Number.isFinite(_pitchStdTop)  ? _pitchStdTop  : null,
    ["MFCC 평균"]:      _mfccMeanVec,
    ["MFCC 표준편차"]:  _mfccStdVec,
  };
}


/* ======================= 메인 페이지 ======================= */
export default function AnalysisVoice() {
  const [fileInfo, setFileInfo] = useState({ audio: null, script: null, audioUrl: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [radarData, setRadarData] = useState([]);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState(''); // 진행 상태 텍스트

  const audioInputRef = useRef(null);
  const scriptInputRef = useRef(null);
  const audioRef = useRef(null);

  const statusToText = (s) => {
    switch ((s || '').toLowerCase()) {
      case 'queued': return '대기중…';
      case 'uploading': return '업로드 중…';
      case 'running': return '분석 중…';
      case 'fetching_result': return '결과 정리 중…';
      case 'done': return '완료';
      default: return s || '진행 중…';
    }
  };

  /** 실제 FastAPI 호출: multipart 업로드 */
  const handleAnalyze = useCallback(async () => {
    if (!fileInfo.audio || !fileInfo.script) {
      setError('음성 파일(.mp3/.wav)과 대본(.txt) 파일을 모두 선택해주세요.');
      return;
    }
    setError(null);
    setLoading(true);
    setResult(null);
    setProgress(5);
    setStatusText('업로드 준비 중…');

    try {
      const api = await runSpeechAnalysis(
        fileInfo.audio,
        fileInfo.script,
        (p, status) => {
          const prog = Math.max(5, Math.min(95, Math.round(p)));
          setProgress(prog);
          if (status) setStatusText(statusToText(status));
        }
      );

      // ✅ 분석 결과 표준 JSON(segments_results.json)을 백엔드 프록시로 재조회
      //    경로 통일: /speech/segments-results  (하이픈 포함, /api 없음)
      try {
        const r = await fetch(`/speech/segments-results`, { cache: 'no-store' });
        if (r.ok) {
          const seg = await r.json();

          // 총합
          const total =
            typeof seg?.summary?.filler_count === 'number'
              ? seg.summary.filler_count
              : (seg?.summary?.fillers_by_type
                  ? Object.values(seg.summary.fillers_by_type).reduce((a, b) => a + Number(b || 0), 0)
                  : 0);

          // 유형별
          const byType = seg?.summary?.fillers_by_type || {};

          // occurrences: 있으면 사용, 없으면 segments에서 생성
          let occurrences = Array.isArray(seg?.filler?.occurrences) ? seg.filler.occurrences : [];
          if (!occurrences.length && Array.isArray(seg?.segments)) {
            occurrences = seg.segments.flatMap((s) => {
              const start = Number(s.start_sec ?? s.start ?? 0);
              const end   = Number(s.end_sec   ?? s.end   ?? start);
              const mid   = (start + end) / 2;
              return (s.fillers || []).map((fv) => {
                const word = String(fv?.word ?? fv?.token ?? fv?.type ?? 'F');
                const tAbs = Number(fv?.time ?? fv?.time_sec);
                if (Number.isFinite(tAbs)) return { time: tAbs, type: word };
                const sr = Number(fv?.start_sec ?? fv?.start_rel ?? 0);
                const er = Number(fv?.end_sec   ?? fv?.end_rel   ?? sr);
                const t  = Number.isFinite(fv?.start_sec) || Number.isFinite(fv?.end_sec)
                  ? (sr + er) / 2
                  : mid + (sr + er) / 2;
                return { time: t, type: word };
              });
            });
          }

          api.filler = { total, by_type: byType, occurrences };
          api.filler_count = total;
          if (Array.isArray(seg?.silence)) api.silence = seg.silence;
          if (Array.isArray(seg?.segments) && !api.segments) api.segments = seg.segments;
        }
      } catch (_) {}

      const ui = mapServiceToUi(api);
      setResult(ui);
      setProgress(100);
      setStatusText('완료');
    } catch (e) {
      console.error('analysis error', e);
      const raw =
        e?.response?.data?.detail ||
        e?.message ||
        '분석 중 오류가 발생했어요.';
      setError(raw);
      setProgress(0);
      setStatusText('');
    } finally {
      setLoading(false);
    }
  }, [fileInfo.audio, fileInfo.script]);

  const handleReplay = () => { if (audioRef.current) { audioRef.current.currentTime = 0; audioRef.current.play(); } };

  const handleReset = () => {
    setFileInfo({ audio: null, script: null, audioUrl: null });
    if (audioInputRef.current) audioInputRef.current.value = '';
    if (scriptInputRef.current) scriptInputRef.current.value = '';
    setLoading(false);
    setProgress(0);
    setStatusText('');
    setError(null);
    setResult(null);
    setRadarData([]);
  };

  // 레이더 차트 데이터(0~10 점수)
  useEffect(() => {
    if (!result) return;
    setRadarData([
      { category: "발음",   value: ((result.scores.pronunciation ?? 0) * 2) },
      { category: "억양",   value: ((result.scores.intonation ?? 0) * 2) },
      { category: "속도",   value: ((result.scores.speed ?? 0) * 2) },
      { category: "간투사", value: ((result.scores.filler ?? 0) * 2) },
      { category: "무음",   value: ((result.scores.pause ?? 0) * 2) },
      { category: "안정성", value: ((result.scores.mfcc ?? 0) * 2) }
    ]);
  }, [result]);

  return (
    <div className="container mx-auto p-8 space-y-10 max-w-7xl">
      {/* ================= 업로드 박스 ================= */}
      <div className="max-w-xl mx-auto p-8 border border-gray-200 bg-[#f7f9fc] rounded-lg text-center">
        <Mic className="mx-auto mb-4 w-12 h-12 text-gray-400" />
        <h3 className="text-lg font-medium mb-2">음성 파일 업로드</h3>
        <p className="text-sm text-gray-500 mb-4">.mp3, .wav, .txt 파일 업로드 가능</p>

        {/* 숨김 input */}
        <input
          type="file" accept=".mp3,.wav" ref={audioInputRef} className="hidden"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) setFileInfo(prev => ({ ...prev, audio: file, audioUrl: URL.createObjectURL(file) }));
          }}
        />
        <input
          type="file" accept=".txt" ref={scriptInputRef} className="hidden"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) setFileInfo(prev => ({ ...prev, script: file }));
          }}
        />

        {/* 선택 버튼 2개 */}
        <div className="flex justify-center gap-4">
          <button
            onClick={() => audioInputRef.current?.click()}
            className="px-6 py-3 bg-white rounded-full border border-gray-300 hover:bg-gray-100 transition"
          >
            음성 파일 선택
          </button>
          <button
            onClick={() => scriptInputRef.current?.click()}
            className="px-6 py-3 bg-white rounded-full border border-gray-300 hover:bg-gray-100 transition"
          >
            대본 파일 선택
          </button>
        </div>

        {/* 파일명 표시 */}
        {(fileInfo.audio || fileInfo.script) && (
          <p className="text-sm text-gray-600 mt-4">
            {fileInfo.audio && <>🎧 {fileInfo.audio.name}</>}
            {fileInfo.audio && fileInfo.script && ' + '}
            {fileInfo.script && <>📝 {fileInfo.script.name}</>}
          </p>
        )}

        {/* 실행/초기화 + 진행/에러 */}
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={handleAnalyze}
            disabled={loading || !fileInfo.audio || !fileInfo.script}
            className="px-4 py-2 rounded-md text-white"
            style={{ backgroundColor: BUTTON_PRIMARY, opacity: (loading || !fileInfo.audio || !fileInfo.script) ? 0.6 : 1 }}
            title="분석 시작"
          >
            {loading ? '분석 중…' : '분석 시작'}
          </button>
          <button
            onClick={handleReset}
            disabled={loading}
            className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
            title="초기화"
          >
            초기화
          </button>
        </div>

        {loading && (
          <div className="mt-4">
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className="h-2 rounded-full"
                style={{ width: `${progress}%`, backgroundColor: COLOR_SECONDARY, transition: 'width 0.2s ease' }}
              />
            </div>
            <p className="mt-2 text-xs text-gray-500">
              {statusText} {progress}%</p>
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>

      {/* 결과 */}
      {result && (
        <ResultSection
          result={result}
          audioUrl={fileInfo.audioUrl}
          audioRef={audioRef}
          onReplay={() => { if (audioRef.current) { audioRef.current.currentTime = 0; audioRef.current.play(); } }}
          onReload={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          radarData={radarData}
        />
      )}
    </div>
  );
}

/* ======================= 결과 섹션 ======================= */
function ResultSection({ result, audioUrl, audioRef, onReplay, onReload, radarData }) {
  const totalScore10 = Number(((Object.values(result.scores).reduce((a, b) => a + b, 0) / 6) * 2).toFixed(1));

  // 백엔드가 주는 stt_results_url 우선, 없으면 최신 결과 엔드포인트
  const sttPath = result?.stt_html_url || '/speech/results/latest';
  const sttUrl = sttPath.startsWith('http')
    ? sttPath
    : `${API_BASE}${sttPath.startsWith('/') ? '' : '/'}${sttPath}`;

  return (
    <div className="space-y-10">
      {/* 오디오 */}
      {audioUrl && (
        <div className="flex items-center space-x-4 max-w-2xl mx-auto">
          <audio ref={audioRef} src={audioUrl} controls className="w-full" />
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 sm:gap-6">
        <ResultCard
          icon={<CheckCircle />}
          label="발음 정확도"
          value={`${((result?.features?.pronunciation_accuracy ?? 0) * 100).toFixed(1)}%`}
        />

        <ResultCard
          icon={<Volume2 />}
          label="발화 속도"
          value={`${(result?.features?.wpm ?? 0).toFixed(1)} WPM`}
        />

        {/* 억양 다양성: Pitch 평균 / Pitch 표준편차 */}
        <ResultCard
          icon={<Activity />}
          label="억양 다양성"
          value={(() => {
            const { mean, std } = getPitchTuple(result);
            return (mean != null && std != null)
              ? `${mean.toFixed(2)} / ${std.toFixed(2)}`
              : "N/A";
          })()}
        />

        <ResultCard
          icon={<Slash />}
          label="간투사 사용"
          value={`${result?.features?.filler_count ?? 0}회`}
        />

        <ResultCard
          icon={<PauseCircle />}
          label="무음 비율"
          value={`${((result?.features?.pause_ratio ?? 0) * 100).toFixed(1)}%`}
        />

        {/* 음색 안정성: MFCC 평균벡터/표준편차벡터의 평균값 요약 */}
        <ResultCard
          icon={<AudioLines />}
          label="음색 안정성"
          value={(() => {
            const { mean, std } = getMFCCAvgTuple(result);
            return (mean != null && std != null)
              ? `${mean.toFixed(2)} / ${std.toFixed(2)}`
              : "N/A";
          })()}
        />
      </div>

      {/* 발표 특징 분석 */}
      <section id="analysis" className="py-10 -mx-4 sm:mx-0 bg-[#f8fafc]">
        <div className="mx-auto w-full max-w-[1400px] px-4">
          <div className="border rounded-2xl bg-white/70" style={{ borderColor: '#f1f5f9' }}>
            <div className="p-4 sm:p-6 border-b" style={{ borderColor: '#eef2f7' }}>
              <SectionHeader
                number="①"
                title="발표 특징 분석"
                hint="그래프 영역 클릭 시 5초 구간 재생"
              />
            </div>
            <div className="p-4 sm:p-6">
              <ChartsBlock result={result} audioRef={audioRef} />
            </div>
          </div>
        </div>
      </section>

      {/* 최종 점수 및 개선사항 */}
      <section id="summary" className="py-12 -mx-4 sm:mx-0" style={{ backgroundColor: '#f9f8fc' }}>
        <div className="mx-auto w-full max-w-[1400px] px-4">
          <div className="flex items-center gap-3 mb-6">
            <span className="w-8 h-8 flex items-center justify-center rounded-full text-white text-sm font-bold" style={{ backgroundColor: COLOR_SECONDARY }}>②</span>
            <h2 className="text-lg font-bold text-gray-800">최종 점수 및 개선사항</h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <ElevCard className="p-4 sm:p-5">
              <h3 className="text-sm font-medium mb-3 text-center" style={{ color: COLOR_PRIMARY }}>
                항목별 종합 점수 (0~10)
              </h3>
              <div className="w-full h-[300px]">
                <ResponsiveContainer>
                  <RadarChart data={radarData}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="category" />
                    <PolarRadiusAxis angle={30} domain={[0, 10]} />
                    <Radar name="Score" dataKey="value" stroke={COLOR_PRIMARY} fill={COLOR_ACCENT} fillOpacity={0.45} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </ElevCard>

            <ElevCard className="p-5">
              {/* 카드 상단에 최종 점수 크게 노출 */}
              <div className="text-center mb-4">
                <div className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-white text-lg font-bold"
                     style={{ backgroundColor: COLOR_SECONDARY }}>
                  총점 {Number.isFinite(totalScore10) ? totalScore10 : '0.0'} / 10
                </div>
              </div>

              {/* 피드백 */}
              {result?.feedback && (
                <div className="mb-4 p-3 rounded-md border text-sm"
                     style={{ background: '#F6F5FF', borderColor: '#E7E4FF', color: '#4B3FA4' }}>
                  {result.feedback}
                </div>
              )}

              <div className="text-xs flex items-start gap-2 rounded-md bg-gray-50 p-3 border border-gray-100">
                <Lightbulb className="w-4 h-4" style={{ color: COLOR_SECONDARY }} />
                <span className="leading-5 text-gray-700">
                  그래프에서 성과가 좋았던 구간을 반복 청취하고, 점수가 낮은 항목(예: 속도/억양)을 개선 목표로 삼아 다음 녹음에서 실험해 보세요.
                </span>
              </div>
            </ElevCard>
          </div>
        </div>
      </section>

      {/* 하단 버튼 */}
      <div className="mt-10 mb-8 flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={onReplay}
          className="w-full sm:w-auto px-6 py-3 text-white font-semibold rounded-lg transition"
          style={{ backgroundColor: COLOR_ACCENT }}
        >
          음성 재생
        </button>

        <a
          href={sttUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 text-white font-semibold rounded-lg transition"
          style={{ backgroundColor: COLOR_PRIMARY }}
        >
          <ExternalLink className="w-4 h-4 text-white" />
          <span>발음 분석 결과</span>
        </a>

        <button
          onClick={onReload}
          className="w-full sm:w-auto px-6 py-3 border font-normal rounded-lg hover:bg-gray-100 transition"
          style={{ borderColor: '#e5e7eb' }}
        >
          다시 분석하기
        </button>
      </div>
    </div>
  );
}

/* ======================= 카드 ======================= */
function ResultCard({ icon, label, value }) {
  const str = String(value ?? '');
  const unitMatch = str.match(/(WPM|%|\/ 10|\/ 5)$/);
  const unit = unitMatch ? unitMatch[0] : '';
  const num = unit ? str.replace(unit, '').trim() : str;
  return (
    <div className="p-4 bg-white rounded-lg border border-gray-100 shadow-sm text-center">
      <div className="mb-2 mx-auto w-6 h-6" style={{ color: COLOR_PRIMARY }}>{icon}</div>
      <p className="text-2xl font-semibold tracking-tight">
        {num}
        {unit && <span className="ml-1 text-sm text-gray-500 align-middle">{unit}</span>}
      </p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  );
}

/* ======================= 차트 블록 (Compact/Detailed) ======================= */
function ChartsBlock({ result, audioRef }) {
  const [compact, setCompact] = useState(true);

  const segments = result?.segments?.length ? result.segments : DUMMY_SEGMENTS;

  // 전역이 비어있으면 세그먼트 상대시간을 절대시간으로 보정
  const fillerOccurrences = React.useMemo(() => {
    if (Array.isArray(result?._globalFillers) && result._globalFillers.length) return result._globalFillers;
    const list = [];
    (segments || []).forEach((s) => {
      const { start: segStart } = parseTimeRange(s.time_range);
      (s.fillers || []).forEach((fv) => {
        let t = null, word = '어';
        if (Array.isArray(fv)) {
          const fs = Number(fv[1] ?? 0), fe = Number(fv[2] ?? fs);
          t = (fs + fe) / 2; word = String(fv[0] ?? '어');
        } else if (typeof fv === 'object') {
          if ('time_sec' in fv || 'time' in fv) t = Number(fv.time_sec ?? fv.time);
          else if ('start_sec' in fv || 'end_sec' in fv) t = Number(((fv.start_sec ?? 0) + (fv.end_sec ?? 0)) / 2);
          else if ('start_rel' in fv || 'end_rel' in fv) {
            const fs = Number(segStart + (fv.start_rel ?? 0));
            const fe = Number(segStart + (fv.end_rel ?? (fv.start_rel ?? 0)));
            t = (fs + fe) / 2;
          }
          word = String(fv.word ?? fv.token ?? '어');
        }
        if (Number.isFinite(t)) list.push({ time_sec: t, word, duration: 0.3 });
      });
    });
    return list.length ? list : DUMMY_FILLERS;
  }, [result, segments]);

  const silenceIntervals = React.useMemo(() => {
    if (Array.isArray(result?._globalSilence) && result._globalSilence.length) return result._globalSilence;
    const list = [];
    (segments || []).forEach((s) => {
      const { start: segStart } = parseTimeRange(s.time_range);
      (s.silence || []).forEach((iv) => {
        let ss, ee;
        if (Array.isArray(iv)) { ss = Number(segStart + (iv[0] ?? 0)); ee = Number(segStart + (iv[1] ?? 0)); }
        else {
          const sAbs = Number(iv.start_sec ?? iv.start ?? NaN);
          const eAbs = Number(iv.end_sec   ?? iv.end   ?? NaN);
          if (Number.isFinite(sAbs) && Number.isFinite(eAbs)) { ss = sAbs; ee = eAbs; }
          else { ss = Number(segStart + (iv.start_rel ?? 0)); ee = Number(segStart + (iv.end_rel ?? 0)); }
        }
        if (Number.isFinite(ss) && Number.isFinite(ee)) list.push({ start_sec: ss, end_sec: ee });
      });
    });
    return list.length ? list : DUMMY_SILENCE;
  }, [result, segments]);

  const pauseRatioPct = Number((result?.features?.pause_ratio ?? 0) * 100);

  const fillerItems = React.useMemo(() => {
    // ✅ 백엔드(by_type) 집계가 있으면 그대로 사용
    if (Array.isArray(result?._fillerByType) && result._fillerByType.length) {
      return [...result._fillerByType].sort((a,b)=>b.count-a.count).slice(0, 6);
    }
    // 없으면 occurrences로 폴백
    const m = new Map();
    (fillerOccurrences || []).forEach(f => {
      const w = String(f.word ?? '기타');
      m.set(w, (m.get(w) || 0) + 1);
    });
    return Array.from(m, ([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [fillerOccurrences, result?._fillerByType]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <div className="text-sm flex items-center gap-2">
          <span className={!compact ? "text-gray-400" : "font-medium"}>Compact</span>
          <button
            onClick={() => setCompact(v => !v)}
            className="px-3 py-1 border rounded-md bg-white hover:bg-gray-50"
            title="요약/상세 전환"
            style={{ borderColor: COLOR_SECONDARY, color: COLOR_SECONDARY }}
          >
            {compact ? "자세히 보기" : "간단히 보기"}
          </button>
          <span className={compact ? "text-gray-400" : "font-medium"}>Detailed</span>
        </div>
      </div>

      {compact ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <WPMBarMini segments={segments} audioRef={audioRef} />
          <PitchAreaMini segments={segments} audioRef={audioRef} />
          <MFCCSparkMini segments={segments} audioRef={audioRef} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <SilenceCard ratioPercent={pauseRatioPct} />
            <FillerCard items={fillerItems} />
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          <WPMChart segments={segments} band={[110, 160]} audioRef={audioRef} height={220} />
          <PitchChart segments={segments} bandScale={0.2} audioRef={audioRef} height={220} />

          {/* 순서 변경: 음색(평균) → 침묵/간투사 카드 */}
          <MFCCOverall segments={segments} audioRef={audioRef} height={220} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <SilenceCard ratioPercent={pauseRatioPct} />
            <FillerCard items={fillerItems} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Compact 미니 차트들 ---------- */
function WPMBarMini({ segments, audioRef }) {
  const data = React.useMemo(
    () => (segments || []).map((s, i) => ({ t: midSec(s.time_range, i), wpm: Number(s.wpm || 0), idx: i })),
    [segments]
  );

  const handleClick = (e) => {
    const p = e?.activePayload?.[0]?.payload; if (!p) return;
    const { start, end } = parseTimeRange(segments[p.idx]?.time_range);
    if (Number.isFinite(start) && Number.isFinite(end)) playSegment(audioRef, start, end);
  };

  const avg = Math.round((data.reduce((a, d)=>a+d.wpm,0)/(data.length||1)) * 10) / 10;

  return (
    <section>
      <div className="flex items-center justify-between mb-1">
        <h5 className="font-semibold">발화 속도(평균)</h5>
      </div>
      <div style={{ width: "100%", height: 180 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} onClick={handleClick}>
            <CartesianGrid strokeDasharray="2 4" vertical={false} strokeOpacity={0.2} />
            <XAxis dataKey="t" tickFormatter={v => `${v.toFixed(0)}s`} fontSize={11} height={20}/>
            <YAxis hide />
            <Tooltip labelFormatter={v=>`t=${Number(v).toFixed(2)}s`} formatter={(v)=>[`${v.toFixed?.(1)} WPM`, "평균"]}/>
            <Legend wrapperStyle={{ display: 'none' }}/>
            <ReferenceLine y={avg} strokeOpacity={0.5} stroke={COLOR_SECONDARY} />
            <Bar dataKey="wpm" fill={COLOR_PRIMARY} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function PitchAreaMini({ segments, audioRef }) {
  const data = React.useMemo(
    () => (segments || []).map((s, i) => ({ t: midSec(s.time_range, i), pitch: Number(s.pitch_mean || 0), idx: i })),
    [segments]
  );

  const median = React.useMemo(() => {
    const arr = data.map(d=>d.pitch).filter(Number.isFinite).sort((a,b)=>a-b);
    if (!arr.length) return 0; const m = Math.floor(arr.length/2);
    return arr.length % 2 ? arr[m] : (arr[m-1]+arr[m])/2;
  }, [data]);

  const handleClick = (e) => {
    const p = e?.activePayload?.[0]?.payload; if (!p) return;
    const { start, end } = parseTimeRange(segments[p.idx]?.time_range);
    if (Number.isFinite(start) && Number.isFinite(end)) playSegment(audioRef, start, end);
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-1">
        <h5 className="font-semibold">피치(평균)</h5>
      </div>
      <div style={{ width: "100%", height: 180 }}>
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} onClick={handleClick}>
            <CartesianGrid strokeDasharray="2 4" vertical={false} strokeOpacity={0.2} />
            <XAxis dataKey="t" tickFormatter={v => `${v.toFixed(0)}s`} fontSize={11} height={20}/>
            <YAxis hide />
            <Tooltip labelFormatter={v=>`t=${Number(v).toFixed(2)}s`} formatter={(v)=>[`${v.toFixed?.(1)} Hz`, "피치(평균)"]}/>
            <Legend wrapperStyle={{ display: 'none' }}/>
            <ReferenceLine y={median} strokeOpacity={0.5} stroke={COLOR_SECONDARY}/>
            <Area type="monotone" dataKey="pitch" fill={COLOR_PRIMARY} stroke={COLOR_PRIMARY} fillOpacity={0.35}/>
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function MFCCSparkMini({ segments, audioRef }) {
  const data = React.useMemo(
    () => (segments || []).map((seg, i) => {
      const vals = Array.isArray(seg.mfcc_mean) ? seg.mfcc_mean : [];
      return { t: midSec(seg.time_range, i), mean: mean(vals), idx: i };
    }),
    [segments]
  );

  const handleClick = (e) => {
    const p = e?.activePayload?.[0]?.payload; if (!p) return;
    const { start, end } = parseTimeRange(segments[p.idx]?.time_range);
    if (Number.isFinite(start) && Number.isFinite(end)) playSegment(audioRef, start, end);
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-1">
        <h5 className="font-semibold">음색(평균)</h5>
      </div>
      <div style={{ width: "100%", height: 180 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} onClick={handleClick}>
            <CartesianGrid strokeDasharray="2 4" vertical={false} strokeOpacity={0.2} />
            <XAxis dataKey="t" tickFormatter={v => `${v.toFixed(0)}s`} fontSize={11} height={20}/>
            <YAxis hide />
            <Tooltip labelFormatter={v=>`t=${Number(v).toFixed(2)}s`} formatter={(v)=>[v.toFixed?.(2), "음색(평균)"]}/>
            <Legend wrapperStyle={{ display: 'none' }}/>
            <Line type="monotone" dataKey="mean" dot={false} strokeWidth={1.8} stroke={COLOR_PRIMARY}/>
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

/* ---------- Detailed 차트 ---------- */
function WPMChart({ segments, band = [110, 160], audioRef, height = 220 }) {
  const data = React.useMemo(() => {
    return (segments || []).map((s, i) => ({ t: midSec(s.time_range, i), wpm: Number(s.wpm || 0), idx: i }));
  }, [segments]);

  const domain = React.useMemo(() => {
    if (!data.length) return [0, 200];
    const vals = data.map(d => d.wpm).concat(band).filter(Number.isFinite);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const pad = Math.max(5, (hi - lo) * 0.1);
    return [Math.max(0, Math.floor(lo - pad)), Math.ceil(hi + pad)];
  }, [data, band]);

  const handleClick = (e) => {
    const payload = e?.activePayload?.[0]?.payload;
    if (!payload) return;
    const seg = segments[payload.idx];
    const { start, end } = parseTimeRange(seg?.time_range);
    if (Number.isFinite(start) && Number.isFinite(end)) playSegment(audioRef, start, end);
  };

  const TooltipWpm = ({ active, payload, label }) => {
    if (active && payload?.length) {
      const w = payload.find(p => p.dataKey === "wpm")?.value;
      return (
        <div className="bg-white border rounded-md p-2 text-sm">
          <div><b>{`t=${Number(label).toFixed(2)}s`}</b></div>
          <div>🗣 <b>발화 속도(평균)</b> {w?.toFixed?.(1)} WPM</div>
          <div className="text-[11px] text-gray-500">그래프 구간을 클릭하면 해당 5초 구간이 재생됩니다.</div>
        </div>
      );
    }
    return null;
  };

  const bandFill = 'rgba(62,180,137,0.12)';

  return (
    <section>
      <SectionTitle icon={<Volume2 />} title="구간별 발화 속도 (WPM)" hint="그래프 구간을 클릭하면 해당 5초 오디오가 재생됩니다." />
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 12, right: 16, left: 0, bottom: 8 }} onClick={handleClick}>
            <CartesianGrid strokeDasharray="2 4" vertical={false} strokeOpacity={0.4} />
            <XAxis dataKey="t" tickFormatter={v => `${v.toFixed(0)}s`} />
            <YAxis domain={domain} />
            <Tooltip content={<TooltipWpm />} cursor={{ strokeOpacity: 0.15, strokeWidth: 20 }} />
            <Legend verticalAlign="top" align="right" wrapperStyle={{ paddingBottom: 8 }} formatter={(key) => ({ wpm: "발화 속도(평균)" }[key] || key)} />
            <ReferenceArea y1={band[0]} y2={band[1]} strokeOpacity={0} fill={bandFill} />
            <Line type="monotone" dataKey="wpm" dot={false} stroke={COLOR_PRIMARY} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function PitchChart({ segments, bandScale = 0.2, audioRef, height = 220 }) {
  const raw = React.useMemo(() => (segments || []).map((s, i) => ({
    t: midSec(s.time_range, i), pitch: Number(s.pitch_mean || 0), idx: i
  })), [segments]);

  const median = React.useMemo(() => {
    const arr = raw.map(r => r.pitch).filter(v => Number.isFinite(v)).sort((a, b) => a - b);
    if (!arr.length) return 0;
    const m = Math.floor(arr.length / 2);
    return arr.length % 2 ? arr[m] : (arr[m - 1] + arr[m]) / 2;
  }, [raw]);

  const bandMin = median * (1 - bandScale);
  const bandMax = median * (1 + bandScale);
  const data = raw;

  const domain = React.useMemo(() => {
    if (!data.length) return [0, 300];
    const vals = data.map(d => d.pitch).concat([bandMin, bandMax]).filter(Number.isFinite);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const pad = Math.max(5, (hi - lo) * 0.1);
    return [Math.max(0, Math.floor(lo - pad)), Math.ceil(hi + pad)];
  }, [data, bandMin, bandMax]);

  const handleClick = (e) => {
    const payload = e?.activePayload?.[0]?.payload;
    if (!payload) return;
    const seg = segments[payload.idx];
    const { start, end } = parseTimeRange(seg?.time_range);
    if (Number.isFinite(start) && Number.isFinite(end)) playSegment(audioRef, start, end);
  };

  const TooltipPitch = ({ active, payload, label }) => {
    if (active && payload?.length) {
      const p = payload.find(p => p.dataKey === "pitch")?.value;
      return (
        <div className="bg-white border rounded-md p-2 text-sm">
          <div><b>{`t=${Number(label).toFixed(2)}s`}</b></div>
          <div>🎼 <b>피치(평균)</b> {p?.toFixed?.(1)} Hz</div>
          <div className="text-[11px] text-gray-500">그래프 구간을 클릭하면 해당 5초 구간이 재생됩니다.</div>
        </div>
      );
    }
    return null;
  };

  const bandFill = 'rgba(130,107,198,0.12)';

  return (
    <section>
      <SectionTitle icon={<Activity />} title="구간별 피치(Hz)" hint="그래프 구간을 클릭하면 해당 5초 오디오가 재생됩니다." />
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 12, right: 16, left: 0, bottom: 8 }} onClick={handleClick}>
            <CartesianGrid strokeDasharray="2 4" vertical={false} strokeOpacity={0.4} />
            <XAxis dataKey="t" tickFormatter={v => `${v.toFixed(0)}s`} />
            <YAxis domain={domain} />
            <Tooltip content={<TooltipPitch />} cursor={{ strokeOpacity: 0.15, strokeWidth: 20 }} />
            <Legend verticalAlign="top" align="right" wrapperStyle={{ paddingBottom: 8 }} formatter={(key) => ({ pitch: "피치(평균)" }[key] || key)} />
            <ReferenceArea y1={bandMin} y2={bandMax} strokeOpacity={0} fill={bandFill} />
            <Line type="monotone" dataKey="pitch" dot={false} stroke={COLOR_PRIMARY} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function MFCCOverall({ segments, audioRef, height = 220 }) {
  const data = React.useMemo(() => {
    return (segments || []).map((seg, i) => {
      const vals = Array.isArray(seg.mfcc_mean) ? seg.mfcc_mean : [];
      const avg = mean(vals);
      return { t: midSec(seg.time_range, i), mean: avg, idx: i };
    });
  }, [segments]);

  const domain = React.useMemo(() => {
    if (!data.length) return [0, 1];
    const vals = data.map(d => d.mean).filter(Number.isFinite);
    if (!vals.length) return [0, 1];
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const pad = (hi - lo) * 0.1 || 1;
    return [Math.floor(lo - pad), Math.ceil(hi + pad)];
  }, [data]);

  const handleClick = (e) => {
    const payload = e?.activePayload?.[0]?.payload;
    if (!payload) return;
    const seg = segments[payload.idx];
    const { start, end } = parseTimeRange(seg?.time_range);
    if (Number.isFinite(start) && Number.isFinite(end)) playSegment(audioRef, start, end);
  };

  const TooltipMFCC = ({ active, payload, label }) => {
    if (active && payload?.length) {
      const m = payload.find(p => p.dataKey === "mean")?.value;
      return (
        <div className="bg-white border rounded-md p-2 text-sm">
          <div><b>{`t=${Number(label).toFixed(2)}s`}</b></div>
          <div>🎯 <b>음색(평균)</b> {m?.toFixed?.(2)} — 13개 MFCC의 단순 평균</div>
          <div className="text:[11px] text-gray-500">그래프 구간을 클릭하면 해당 5초 구간이 재생됩니다.</div>
        </div>
      );
    }
    return null;
  };

  return (
    <section>
      <SectionTitle icon={<AudioLines />} title="시간에 따른 음색(평균)" hint="그래프 구간을 클릭하면 해당 5초 오디오가 재생됩니다." />
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 12, right: 16, left: 0, bottom: 8 }} onClick={handleClick}>
            <CartesianGrid strokeDasharray="2 4" vertical={false} strokeOpacity={0.4} />
            <XAxis dataKey="t" tickFormatter={v => `${v.toFixed(0)}s`} />
            <YAxis domain={domain} />
            <Tooltip content={<TooltipMFCC />} cursor={{ strokeOpacity: 0.15, strokeWidth: 20 }} />
            <Legend verticalAlign="top" align="right" wrapperStyle={{ paddingBottom: 8 }} formatter={(key) => ({ mean: "음색(평균)" }[key] || key)} />
            <Line type="monotone" dataKey="mean" dot={false} stroke={COLOR_PRIMARY} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

/* ====== 입체 카드 ====== */
function ElevCard({ className = "", children }) {
  return (
    <div
      className={
        "bg-white rounded-2xl border border-gray-100 shadow-md " +
        "hover:shadow-xl hover:-translate-y-0.5 transition duration-200 " +
        className
      }
      style={{ boxShadow: "0 6px 18px rgba(24, 39, 75, 0.08)" }}
    >
      {children}
    </div>
  );
}
