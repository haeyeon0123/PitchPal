// 음성 분석 페이지

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
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
  Lightbulb, ChevronDown
} from 'lucide-react';

import { runSpeechAnalysis } from '../services/speechService';
import { API_BASE } from '../config/apiEndpoints';

// ====== 브랜드 컬러 ======
const COLOR_PRIMARY   = '#5686C4';
const COLOR_SECONDARY = '#826BC6';
const COLOR_ACCENT    = '#3EB489';
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

// 5초 단위 더미 데이터
const DUMMY_SEGMENTS = Array.from({ length: 12 }, (_, i) => ({
  time_range: `${(i * 5).toFixed(2)}-${((i + 1) * 5).toFixed(2)}`,
  wpm: 120 + Math.sin(i * 0.6) * 15 + (i % 5 === 3 ? 25 : 0),
  pitch_mean: 180 + Math.cos(i * 0.5) * 20 + (i % 7 === 4 ? -30 : 0),
  mfcc_mean: Array.from({ length: 13 }, (_, k) => 10 + Math.sin(i * 0.5 + k * 0.2) * 2),
  fillers: [],
  silence: []
}));
const DUMMY_SILENCE = [
  { start_sec: 15, end_sec: 18 },
  { start_sec: 41, end_sec: 44 },
];

// === KPI helpers ===
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

// 세션ID 추출(응답 or STT HTML 경로)
const extractSessionId = (api) => {
  const direct = api?.session_id || api?.result?.session_id || api?.data?.session_id;
  if (direct) return String(direct);
  const url = api?.stt_result_url || api?.stt_results_url || api?.stt_html_url;
  if (!url) return null;
  const m = String(url).match(/\/model\/speech\/results\/([a-f0-9]{32})\//i);
  return m?.[1] || null;
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

/* ==== 침묵/간투사 카드 ==== */
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

    <div className="mt-3 h-2 w-full bg-gray-100 rounded-full overflow-hidden" aria-hidden>
      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: COLOR_PRIMARY }} />
    </div>

    <p className="text-xs text-gray-600 mt-auto pt-2">
      긴 침묵은 줄이고, 짧게 멈추면 좋아요.
    </p>
  </div>
);
}

// ==== 간투사 카드 (종류/횟수 중심) ====
// ==== 간투사 카드 (SilenceCard와 UI 통일) ====
function FillerCard({ total = 0, items = [] }) {
  // items: [{ word, count }] 또는 { [word]: count } 둘 다 허용
  const pairs = Array.isArray(items)
    ? items.map(it => ({ word: String(it?.word ?? ''), count: Number(it?.count ?? 0) }))
    : Object.entries(items || {}).map(([word, count]) => ({ word, count: Number(count || 0) }));

  const clean = pairs
    .filter(it => it.word && Number.isFinite(it.count))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10); // 상위 10개까지만

  const totalNum = Number(total) || 0;

  return (
    <div className="p-4 rounded-2xl bg-white shadow-sm border border-gray-100 flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-2">
        <h5 className="font-semibold">간투사 사용</h5>
        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-50 text-gray-500 border border-gray-200">
          Fillers
        </span>
      </div>

      {/* 총합(크게) */}
      <div className="flex items-end gap-2 mb-2">
        <span className="text-3xl font-bold" style={{ color: COLOR_SECONDARY }}>
          {totalNum}회
        </span>
        <span className="text-sm text-gray-500">총 사용</span>
      </div>

      {/* 종류/횟수 목록 */}
      {clean.length ? (
        <ul className="divide-y divide-gray-100">
          {clean.map((it, i) => (
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

      {/* 푸터 설명 */}
      <p className="text-xs text-gray-600 mt-auto pt-2">
        간투사를 줄이면 메시지가 더 명확해져요.
      </p>
    </div>
  );
}



/* ======================= API → UI 매핑 ======================= */
function mapServiceToUi(api) {
  const normProb = (v) => {
    const x = Number(v ?? 0);
    if (!Number.isFinite(x)) return 0;
    return x > 1.5 ? x / 100 : x;
  };

  const pronunciation_accuracy = normProb(
    api?.pronunciation_accuracy ??
    api?.["Pronunciation Accuracy"] ??
    (typeof api?.["발음 유사도 점수"] === "number"
      ? (api["발음 유사도 점수"] > 1 ? api["발음 유사도 점수"] / 100 : api["발음 유사도 점수"])
      : api?.발음_유사도_점수)
  );

  const wpm = Number(api?.wpm ?? api?.WPM ?? 0);
  const pause_ratio = Number(api?.pause_ratio ?? api?.["Pause Ratio"] ?? api?.무음_구간_비율 ?? 0);

  // 총합
  let filler_count = Number(
    api?.["Filler Count"] ??
    (api?.filler && typeof api.filler.total !== 'undefined' ? api.filler.total : undefined) ??
    api?.filler_count ?? api?.간투사_수 ?? api?.fillerTotal ?? 0
  );

  // 세그먼트
  const segIn = Array.isArray(api?.segments) ? api.segments : [];
  const stride = Number(api?.segment_stride_sec ?? 5);

  const segments = segIn.length
    ? segIn.map((s, i) => {
        const start = Number(s.start_sec ?? s.start ?? parseTimeRange(s.time_range ?? '').start ?? i * stride);
        const end   = Number(s.end_sec   ?? s.end   ?? parseTimeRange(s.time_range ?? '').end   ?? (start + stride));
        const pmean =
          Number.isFinite(s?.pitch_mean) ? Number(s.pitch_mean) :
          (Number.isFinite(s?.pitch?.mean) ? Number(s.pitch.mean) :
           Number.isFinite(s?.pitch?.avg)  ? Number(s.pitch.avg)  :
           Number.isFinite(api?.pitch_mean) ? Number(api.pitch_mean) : 0);
        return {
          time_range: `${start.toFixed(2)}-${end.toFixed(2)}`,
          wpm: Number(s.wpm ?? s.wpm_mean ?? s.wpmMean ?? 0),
          pitch_mean: pmean,
          mfcc_mean: Array.isArray(s.mfcc_mean) ? s.mfcc_mean : (Array.isArray(api?.mfcc_mean) ? api.mfcc_mean : []),
          fillers: s.fillers ?? [],
          silence: s.silence ?? [],
        };
      })
    : DUMMY_SEGMENTS;

  const silence = Array.isArray(api?.silence) ? api.silence.map(iv => ({
    start_sec: Number(iv.start_sec ?? iv.start ?? 0),
    end_sec:   Number(iv.end_sec   ?? iv.end   ?? 0),
  })) : [];

  // ---- occurrences 통합
  let filler_occurrences = [];
  if (Array.isArray(api?.filler_occurrences)) {
    filler_occurrences = api.filler_occurrences
      .map(o => {
        const start = Number(o.start ?? o.start_sec ?? NaN);
        const end   = Number(o.end   ?? o.end_sec   ?? NaN);
        const time  = Number.isFinite(o.time) ? Number(o.time)
                    : (Number.isFinite(start) && Number.isFinite(end)) ? (start + end) / 2 : NaN;
        const word  = String(o.word ?? o.type ?? 'F');
        return Number.isFinite(time) ? { time_sec: time, word } : null;
      })
      .filter(Boolean);
  } else if (Array.isArray(api?.filler?.occurrences)) {
    filler_occurrences = api.filler.occurrences
      .map(o => {
        const start = Number(o.start ?? o.start_sec ?? NaN);
        const end   = Number(o.end   ?? o.end_sec   ?? NaN);
        const time  = Number.isFinite(o.time) ? Number(o.time)
                    : (Number.isFinite(start) && Number.isFinite(end)) ? (start + end) / 2 : NaN;
        const word  = String(o.word ?? o.type ?? 'F');
        return Number.isFinite(time) ? { time_sec: time, word } : null;
      })
      .filter(Boolean);
  } else if (Array.isArray(api?.["Filler Words"])) {
    filler_occurrences = api["Filler Words"]
      .map(a => Array.isArray(a) && a.length >= 3
        ? { time_sec: (Number(a[1]) + Number(a[2])) / 2, word: String(a[0]) }
        : null)
      .filter(Boolean);
  } else if (Array.isArray(api?.fillers)) {
    filler_occurrences = api.fillers
      .map(f => {
        const start = Number(f.start_sec ?? f.start ?? NaN);
        const end   = Number(f.end_sec   ?? f.end   ?? NaN);
        const time  = Number(f.time ?? f.time_sec ?? ((Number.isFinite(start) && Number.isFinite(end)) ? (start + end) / 2 : NaN));
        const word  = String(f.token ?? f.word ?? 'F');
        return Number.isFinite(time) ? { time_sec: time, word } : null;
      })
      .filter(Boolean);
  }

  // ---- 종류별 집계
  let filler_counts_by_type = null;
  if (api?.filler?.by_type && typeof api.filler.by_type === 'object') {
    filler_counts_by_type = api.filler.by_type;
  } else if (api?.summary?.fillers_by_type && typeof api.summary.fillers_by_type === 'object') {
    filler_counts_by_type = api.summary.fillers_by_type;
  } else if (api?.["간투사_빈도"] && typeof api["간투사_빈도"] === 'object') {
    filler_counts_by_type = api["간투사_빈도"];
  } else if (filler_occurrences.length) {
    const m = {};
    for (const oc of filler_occurrences) {
      const w = String(oc.word ?? '기타');
      m[w] = (m[w] || 0) + 1;
    }
    filler_counts_by_type = m;
  }

  // 총합 보정
  if ((!Number.isFinite(filler_count) || filler_count === 0) && filler_occurrences.length) {
    filler_count = filler_occurrences.length;
  }
  if ((!Number.isFinite(filler_count) || filler_count === 0) && filler_counts_by_type && Object.keys(filler_counts_by_type).length) {
    filler_count = Object.values(filler_counts_by_type).reduce((a, b) => a + Number(b || 0), 0);
  }

  // ✅ 여기서 카드용 아이템을 확정 생성
  let filler_card_items = [];
  if (filler_counts_by_type && typeof filler_counts_by_type === 'object') {
    filler_card_items = Object.entries(filler_counts_by_type)
      .map(([word, count]) => ({ word, count: Number(count || 0) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  } else if (filler_occurrences.length) {
    const m = new Map();
    filler_occurrences.forEach(f => {
      const w = String(f.word ?? '기타');
      m.set(w, (m.get(w) || 0) + 1);
    });
    filler_card_items = Array.from(m, ([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  // ---- 레이더 점수
  const pitchMeanGlobal = Number(api?.pitch_mean ?? api?.["Pitch 평균"] ?? NaN);
  const pitchStdGlobal  = Number(api?.pitch_std  ?? api?.["Pitch 표준편차"] ?? NaN);
  const mfccStdAvg = Array.isArray(api?.mfcc_std) ? mean(api.mfcc_std.map(Math.abs)) : 0;

  const speed5  = (() => {
    if (!Number.isFinite(wpm) || wpm <= 0) return 0;
    const target = 120, sigma = 40;
    const z = Math.exp(-((wpm - target) ** 2) / (2 * sigma ** 2));
    return clamp(z * 5, 0, 5);
  })();
  const filler5 = clamp((10 - Math.min(10, filler_count)) / 10 * 5, 0, 5);
  const pause5  = clamp((1 - pause_ratio) * 5, 0, 5);
  const intonation5 = Number.isFinite(pitchStdGlobal) ? clamp((pitchStdGlobal / 80) * 5, 0, 5) : 0;
  const mfcc5   = clamp((50 - Math.min(50, mfccStdAvg)) / 50 * 5, 0, 5);

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

    // ✅ 하단 분석에서 바로 쓸 수 있도록 확정치 제공
    filler_occurrences,
    filler_counts_by_type,
    filler_card_items,

    // KPI 블록
    kpi: {
      pitch_mean: Number.isFinite(pitchMeanGlobal) ? pitchMeanGlobal : null,
      pitch_std:  Number.isFinite(pitchStdGlobal)  ? pitchStdGlobal  : null,
      mfcc_mean:  Array.isArray(api?.mfcc_mean) ? api.mfcc_mean : [],
      mfcc_std:   Array.isArray(api?.mfcc_std)  ? api.mfcc_std  : [],
    },
    ["Pitch 평균"]:     Number.isFinite(pitchMeanGlobal) ? pitchMeanGlobal : null,
    ["Pitch 표준편차"]: Number.isFinite(pitchStdGlobal)  ? pitchStdGlobal  : null,
    ["MFCC 평균"]:      Array.isArray(api?.mfcc_mean) ? api.mfcc_mean : [],
    ["MFCC 표준편차"]:  Array.isArray(api?.mfcc_std)  ? api.mfcc_std  : [],
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
  const [statusText, setStatusText] = useState('');

  const audioInputRef = useRef(null);
  const scriptInputRef = useRef(null);
  const audioRef = useRef(null);
  const [searchParams] = useSearchParams();  // ★ 추가

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

  // ★ 추가: ?stt 파라미터가 사라질 때(=뒤로가기 등) 결과 섹션(#analysis)로 스크롤
  useEffect(() => {
    if (!result) return;
    const hasStt = searchParams.get('stt') === '1';
    if (!hasStt) {
      const el = document.getElementById('analysis') || document.body;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [searchParams, result]);

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

      // 세션ID 추출
      const sessionId = extractSessionId(api);

      // 세그먼트 재조회: 정식 → 정적 폴백
      if (sessionId) {
        let seg = null;
        try {
          const segResp = await fetch(`${API_BASE}/api/speech/segments/${sessionId}`, { cache: 'no-store' });
          if (segResp.ok) seg = await segResp.json();
        } catch (_) {}
        if (!seg) {
          try {
            const segResp2 = await fetch(`${API_BASE}/model/speech/results/${sessionId}/segments_results.json`, { cache: 'no-store' });
            if (segResp2.ok) seg = await segResp2.json();
          } catch (_) {}
        }

        if (seg) {
          if (Array.isArray(seg?.segments)) api.segments = seg.segments;
          if (Array.isArray(seg?.silence))  api.silence  = seg.silence;

          const totalFromSeg =
            (typeof seg?.summary?.filler_count === 'number' ? seg.summary.filler_count : null) ??
            (typeof seg?.filler?.total === 'number' ? seg.filler.total : null) ??
            (typeof seg?.filler_count === 'number' ? seg.filler_count : null) ??
            (typeof seg?.["간투사 수"] === 'number' ? seg["간투사 수"] : null);

          api.filler = api.filler || {};
          if (typeof totalFromSeg === 'number') {
            api.filler_count = totalFromSeg;
            api.filler.total = totalFromSeg;
          }

          if (seg?.filler?.by_type && typeof seg.filler.by_type === 'object') {
            api.filler.by_type = seg.filler.by_type;
          }
          if (Array.isArray(seg?.filler?.occurrences)) {
            api.filler.occurrences = seg.filler.occurrences;
          }
        }
      }

      const ui = mapServiceToUi(api);
      setResult(ui);
      setProgress(100);
      setStatusText('완료');
    } catch (e) {
      console.error('analysis error', e);
      const raw = e?.response?.data?.detail || e?.message || '분석 중 오류가 발생했어요.';
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

        {/* 선택 버튼 */}
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
              {statusText} {progress}%
            </p>
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
     {/* URL에 ?stt=1 이 있으면 같은 페이지에 결과 HTML 표시 */}
     {result && <SttInlineViewer />}
    </div>
  );
}

/* ======================= 결과 섹션 ======================= */
function ResultSection({ result, audioUrl, audioRef, onReplay, onReload, radarData }) {
  const navigate = useNavigate(); // ★ 추가
  
  // 총점(0~10)
  const totalScore10 = Number(
    ((Object.values(result.scores).reduce((a, b) => a + b, 0) / 6) * 2).toFixed(1)
  );

// --- STT 링크 계산 (응답 URL > 세션ID > 루트 > latest) ---
const sessionIdFromUrl = (() => {
  const url = result?.stt_html_url;
  if (!url) return null;
  const m = String(url).match(/\/model\/speech\/results\/([a-f0-9]{32})\//i);
  return m?.[1] || null;
})();

const sttPath =
  // 1) 백엔드가 정확한 URL을 준 경우
  (result?.stt_html_url && result.stt_html_url) ||
  // 2) 세션 경로 예상
  (sessionIdFromUrl && `/model/speech/results/${sessionIdFromUrl}/stt_results.html`) ||
  // 3) ✅ 루트에 저장된 경우 
  `/model/speech/results/stt_results.html` ||
  // 4) 최후의 수단
  '/speech/results/latest';

const sttUrl = sttPath.startsWith('http')
  ? sttPath
  : `${API_BASE}${sttPath.startsWith('/') ? '' : '/'}${sttPath}`;

  // ★ 수정: 같은 페이지에서 뷰어 토글 (쿼리 파라미터 push)
  const openSttViewer = () => {
    if (!sttUrl) return;
    const next = new URLSearchParams(window.location.search);
    next.set('stt', '1');
    next.set('url', sttUrl);
    navigate({ search: `?${next.toString()}` }, { replace: false });
    // 뷰어 위치로 스크롤
    setTimeout(() => {
      document.getElementById('stt-viewer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  };

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
        <ResultCard icon={<CheckCircle />} label="발음 정확도" value={`${((result?.features?.pronunciation_accuracy ?? 0) * 100).toFixed(1)}%`} />
        <ResultCard icon={<Volume2 />}   label="발화 속도"     value={`${(result?.features?.wpm ?? 0).toFixed(1)} WPM`} />
        <ResultCard
          icon={<Activity />}
          label="억양 다양성"
          value={(() => {
            const { mean, std } = getPitchTuple(result);
            return (mean != null && std != null) ? `${mean.toFixed(2)} / ${std.toFixed(2)}` : "N/A";
          })()}
        />
        <ResultCard icon={<Slash />}       label="간투사 사용" value={`${result?.features?.filler_count ?? 0}회`} />
        <ResultCard icon={<PauseCircle />} label="무음 비율"   value={`${((result?.features?.pause_ratio ?? 0) * 100).toFixed(1)}%`} />
        <ResultCard
          icon={<AudioLines />}
          label="음색 안정성"
          value={(() => {
            const { mean, std } = getMFCCAvgTuple(result);
            return (mean != null && std != null) ? `${mean.toFixed(2)} / ${std.toFixed(2)}` : "N/A";
          })()}
        />
      </div>

      {/* 발표 특징 분석 */}
      <section id="analysis" className="py-10 -mx-4 sm:mx-0 bg-[#f8fafc]">
        <div className="mx-auto w-full max-w-[1400px] px-4">
          <div className="border rounded-2xl bg-white/70" style={{ borderColor: '#f1f5f9' }}>
            <div className="p-4 sm:p-6 border-b" style={{ borderColor: '#eef2f7' }}>
              <SectionHeader number="①" title="발표 특징 분석" hint="그래프 영역 클릭 시 5초 구간 재생" />
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
              <h3 className="text-sm font-medium mb-3 text-center" style={{ color: COLOR_PRIMARY }}>항목별 종합 점수 (0~10)</h3>
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
              <div className="text-center mb-4">
                <div className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-white text-lg font-bold" style={{ backgroundColor: COLOR_SECONDARY }}>
                  총점 {Number.isFinite(totalScore10) ? totalScore10 : '0.0'} / 10
                </div>
              </div>

              {result?.feedback && (
                <div className="mb-4 p-3 rounded-md border text-sm" style={{ background: '#F6F5FF', borderColor: '#E7E4FF', color: '#4B3FA4' }}>
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
        <button onClick={onReplay} className="w-full sm:w-auto px-6 py-3 text-white font-semibold rounded-lg transition" style={{ backgroundColor: COLOR_ACCENT }}>
          음성 재생
        </button>

        <button
          onClick={openSttViewer}
          className="w-full sm:w-auto px-6 py-3 text-white font-semibold rounded-lg transition"
          style={{ backgroundColor: COLOR_PRIMARY }}
          title="발음 분석 결과"
        >
          발음 분석 결과
        </button>

        <button onClick={onReload} className="w-full sm:w-auto px-6 py-3 border font-normal rounded-lg hover:bg-gray-100 transition" style={{ borderColor: '#e5e7eb' }}>
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

/* ======================= 차트 블록 ======================= */
// 종류 리스트 집계 (by_type가 있으면 우선 사용, 없으면 occurrences로 계산)
function ChartsBlock({ result, audioRef }) {
  const [compact, setCompact] = useState(true);

  const segments = Array.isArray(result?.segments) && result.segments.length
    ? result.segments
    : DUMMY_SEGMENTS;

  const pauseRatioPct = Number((result?.features?.pause_ratio ?? 0) * 100);

  // ✅ 간투사 종류 리스트: filler_card_items 우선 → by_type → occurrences → segments.fillers
const fillerItems = (() => {
  // 0) mapServiceToUi에서 만들어 준 카드용 아이템이 있으면 그대로
  if (Array.isArray(result?.filler_card_items) && result.filler_card_items.length) {
    return result.filler_card_items;
  }

  // 1) by_type (프론트/백엔드 어느 쪽이든)
  const byType =
    (result?.filler_counts_by_type && typeof result.filler_counts_by_type === 'object'
      ? result.filler_counts_by_type
      : null) ??
    (result?.filler && typeof result.filler.by_type === 'object'
      ? result.filler.by_type
      : null);

  if (byType) {
    return Object.entries(byType)
      .map(([word, count]) => ({ word, count: Number(count || 0) }))
      .filter(it => it.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  // 2) occurrences에서 집계
  let occ = [];
  if (Array.isArray(result?.filler_occurrences)) {
    // [{ time_sec, word }]
    occ = result.filler_occurrences.map(o => ({ word: String(o.word ?? '기타') }));
  } else if (Array.isArray(result?.filler?.occurrences)) {
    // [{ type|word, ... }]
    occ = result.filler.occurrences.map(o => ({ word: String(o.word ?? o.type ?? '기타') }));
  }

  // 3) 그래도 없으면 세그먼트 안 fillers에서 추출 (["어", start, end] 형태)
  if (!occ.length && Array.isArray(segments)) {
    const list = [];
    segments.forEach(s => {
      const arr = Array.isArray(s?.fillers) ? s.fillers : [];
      arr.forEach(tup => {
        if (Array.isArray(tup) && tup.length) list.push({ word: String(tup[0]) });
      });
    });
    occ = list;
  }

  if (occ.length) {
    const m = new Map();
    occ.forEach(f => {
      const w = String(f.word ?? '기타');
      m.set(w, (m.get(w) || 0) + 1);
    });
    return Array.from(m, ([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  return [];
})();

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
            <FillerCard total={result?.features?.filler_count} items={fillerItems} />
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          <WPMChart segments={segments} band={[110, 160]} audioRef={audioRef} height={220} />
          <PitchChart segments={segments} bandScale={0.2} audioRef={audioRef} height={220} />
          <MFCCOverall segments={segments} audioRef={audioRef} height={220} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <SilenceCard ratioPercent={pauseRatioPct} />
            <FillerCard total={result?.features?.filler_count} items={fillerItems} />
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
          <div className="text-[11px] text-gray-500">그래프 구간을 클릭하면 해당 5초 구간이 재생됩니다.</div>
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

// ★★★ 같은 페이지에 결과 HTML을 띄우는 가벼운 인라인 뷰어
function SttInlineViewer() {
  const [searchParams] = useSearchParams();
  const stt = searchParams.get('stt');
  const urlParam = searchParams.get('url') || "";
  const [html, setHtml] = useState("");
  const [error, setError] = useState("");

  let fetchPath = urlParam;
  if (fetchPath.startsWith("http://localhost:8000")) {
    fetchPath = fetchPath.replace("http://localhost:8000", "");
  } else if (fetchPath.startsWith("https://localhost:8000")) {
    fetchPath = fetchPath.replace("https://localhost:8000", "");
  }

  useEffect(() => {
    if (stt !== '1') return;
    if (!fetchPath) {
      setError("표시할 STT 결과 URL이 없습니다.");
      return;
    }
    (async () => {
      try {
        const res = await fetch(fetchPath, { credentials: "omit" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        let text = await res.text();
        text = text
          .replace(/'([^']+)'/g, "$1")
          .replace(/\[\s*/g, "")
          .replace(/\s*\]/g, "")
          .replace(/,\s*/g, " ")
          .replace(/\s{2,}/g, " ");
        setHtml(text);
      } catch (e) {
        setError(`결과를 불러오지 못했어요: ${e.message}`);
      }
    })();
  }, [stt, fetchPath]);

  if (stt !== '1') return null;

  return (
    <section id="stt-viewer" className="mt-6 -mx-4 sm:mx-0">
      <div className="border rounded-2xl bg-white p-4 sm:p-6">
        <h3 className="text-base font-semibold mb-3">발음 분석 결과</h3>

        {error ? (
          <div className="p-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
        ) : !html ? (
          <div className="text-gray-600">불러오는 중…</div>
        ) : (
          <>
            <iframe
              title="STT Result (cleaned)"
              srcDoc={html}
              className="w-full h-[70vh] border rounded-lg"
            />
            {/* 안내 문구 2줄 (iframe 아래) */}
            <div className="mt-3 text-xs text-gray-600 leading-5">
              <div>[Original Script] 사용자가 업로드한 발표 원고</div>
              <div>[STT Result] 실제 발화를 음성 인식한 결과</div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

