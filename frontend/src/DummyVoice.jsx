// 음성 분석 페이지 (더미데이터 Ver.)
// 업로드 박스 UI 수정본 반영 이전 버전

import React, { useState, useRef, useEffect } from 'react';
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceArea, ReferenceDot, ReferenceLine,
  BarChart, Bar,
  AreaChart, Area,
} from 'recharts';
import {
  CheckCircle, PauseCircle, Slash, Volume2, Activity, Mic, AudioLines, ExternalLink,
  ListChecks, Lightbulb
} from 'lucide-react';
import './Analysis_Voice.css';

// ✅ 입체 카드 컴포넌트
function ElevCard({ className = "", children }) {
  return (
    <div
      className={
        "bg-white rounded-2xl border border-gray-100 shadow-md " +
        "hover:shadow-xl hover:-translate-y-0.5 transition duration-200 " +
        className
      }
      style={{
        boxShadow: "0 6px 18px rgba(24, 39, 75, 0.08)",
      }}
    >
      {children}
    </div>
  );
}


/* ======================= 브랜드 컬러 ======================= */
const COLOR_PRIMARY   = '#5686C4'; // 메인 (차트/아이콘/링크)
const COLOR_SECONDARY = '#826BC6'; // 포인트 (배지/헤더)
const COLOR_ACCENT    = '#3EB489'; // 액션(버튼)/성공 라인

/* ======================= 유틸/더미 ======================= */
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
  mfcc_mean: Array.from({ length: 13 }, (_, k) => 10 + Math.sin(i * 0.5 + k * 0.2) * 2)
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

/* ======================= 메인 페이지 ======================= */
export default function AnalysisVoice() {
  const [fileInfo, setFileInfo] = useState({ audio: null, script: null, audioUrl: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [radarData, setRadarData] = useState([]);
  const [progress, setProgress] = useState(0);

  const audioInputRef = useRef(null);
  const scriptInputRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => {
    if (fileInfo.audio && fileInfo.script) handleUpload();
  }, [fileInfo.audio, fileInfo.script]);

  const handleUpload = async () => {
    setError(null); setLoading(true); setResult(null); setProgress(0);
    const interval = setInterval(() => {
      setProgress(prev => (prev >= 100 ? (clearInterval(interval), 100) : prev + 10));
    }, 100);

    setTimeout(() => {
      const dummy = {
        scores: { pronunciation: 4.2, intonation: 3.8, speed: 4.0, filler: 4.5, pause: 3.5, mfcc: 4.1 },
        features: { pronunciation_accuracy: 0.91, wpm: 140.2, filler_count: 3, pause_ratio: 0.08 },
        feedback: "발음이 정확하고 속도가 안정적입니다. 간투사를 조금만 줄이면 더 좋습니다.",
        stt_html_url: "/model/speech/results/stt_results.html",
        segments: DUMMY_SEGMENTS,
      };
      setResult(dummy);
      setLoading(false);
    }, 1000);
  };

  const handleReplay = () => { if (audioRef.current) { audioRef.current.currentTime = 0; audioRef.current.play(); } };
  const handleReload = () => window.location.reload();

  useEffect(() => {
    if (!result) return;
    setRadarData([
      { category: "발음", value: (result.scores.pronunciation ?? 0) * 2 },
      { category: "억양", value: (result.scores.intonation ?? 0) * 2 },
      { category: "속도", value: (result.scores.speed ?? 0) * 2 },
      { category: "간투사", value: (result.scores.filler ?? 0) * 2 },
      { category: "무음", value: (result.scores.pause ?? 0) * 2 },
      { category: "안정성", value: (result.scores.mfcc ?? 0) * 2 }
    ]);
  }, [result]);

  return (
    <div className="container mx-auto p-8 space-y-10 max-w-7xl">
      {/* 업로드 박스 */}
      <div className="max-w-xl mx-auto p-8 border border-gray-200 bg-[#f7f9fc] rounded-lg text-center">
        <Mic className="mx-auto mb-4 w-12 h-12 text-gray-400" />
        <h3 className="text-lg font-medium mb-2">음성 파일 업로드</h3>
        <p className="text-sm text-gray-500 mb-4">.mp3, .wav, .txt 파일 업로드 가능</p>

        <input
          type="file" accept="audio/*" ref={audioInputRef} className="hidden"
          onChange={e => {
            const file = e.target.files[0];
            if (file) setFileInfo(prev => ({ ...prev, audio: file, audioUrl: URL.createObjectURL(file) }));
          }}
        />
        <input
          type="file" accept=".txt" ref={scriptInputRef} className="hidden"
          onChange={e => {
            const file = e.target.files[0];
            if (file) setFileInfo(prev => ({ ...prev, script: file }));
          }}
        />

        <div className="flex justify-center gap-4">
          {/* 이전 스타일 복귀 */}
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

        {fileInfo.audio && fileInfo.script && (
          <p className="text-sm text-gray-600 mt-4">
            🎧 {fileInfo.audio.name} + 📝 {fileInfo.script.name}
          </p>
        )}
      </div>

      {/* 진행 표시 */}
      {loading && (
        <div className="max-w-2xl mx-auto text-center">
          <progress value={progress} max="100" className="custom-progress w-full h-2 mb-2" />
          <p className="text-sm text-gray-600">분석 중...</p>
        </div>
      )}

      {/* 에러 */}
      {error && <div className="text-center text-red-500">{error}</div>}

      {/* 결과 */}
      {result && (
        <ResultSection
          result={result}
          audioUrl={fileInfo.audioUrl}
          audioRef={audioRef}
          onReplay={handleReplay}
          onReload={handleReload}
          radarData={radarData}
        />
      )}
    </div>
  );
}

/* ======================= 결과 섹션 ======================= */
function ResultSection({ result, audioUrl, audioRef, onReplay, onReload, radarData }) {
  const totalScore10 = (Object.values(result.scores).reduce((a, b) => a + b, 0) / 6 * 2).toFixed(1);

  return (
    <div className="space-y-10">
      {/* 오디오 */}
      {audioUrl && (
        <div className="flex items-center space-x-4 max-w-2xl mx-auto">
          <audio ref={audioRef} src={audioUrl} controls className="w-full" />
        </div>
      )}

      {/* 전체 점수 */}
      <div className="text-center text-xl font-semibold text-gray-700">
        🎯 전체 점수: <span style={{ color: COLOR_SECONDARY }}>{totalScore10}</span> / 10
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 sm:gap-6">
        <ResultCard icon={<CheckCircle />} label="발음 정확도" value={`${(result.features.pronunciation_accuracy * 100).toFixed(1)}%`} />
        <ResultCard icon={<Volume2 />}   label="발화 속도"   value={`${result.features.wpm?.toFixed(1) ?? 'N/A'} WPM`} />
        <ResultCard icon={<Activity />}  label="억양 다양성" value={`${((result.scores.intonation ?? 0) * 2).toFixed(1)} / 10`} />
        <ResultCard icon={<Slash />}     label="간투사 사용" value={`${result.features.filler_count ?? 0}회`} />
        <ResultCard icon={<PauseCircle />} label="무음 비율" value={`${(result.features.pause_ratio * 100).toFixed(1)}%`} />
        <ResultCard icon={<AudioLines />} label="음색 안정성" value={`${((result.scores.mfcc ?? 0) * 2).toFixed(1)} / 10`} />
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

      {/* 종합 피드백 (입체 카드 + 배경 분리) */}
<section id="summary" className="py-12 -mx-4 sm:mx-0" style={{ backgroundColor: '#f9f8fc' }}>
  <div className="mx-auto w-full max-w-[1400px] px-4">
    {/* 제목 바 */}
    <div className="flex items-center gap-3 mb-6">
      <span
        className="w-8 h-8 flex items-center justify-center rounded-full text-white text-sm font-bold"
        style={{ backgroundColor: COLOR_SECONDARY }}
      >
        ②
      </span>
      <h2 className="text-lg font-bold text-gray-800">종합 피드백</h2>
    </div>

    <div className="grid md:grid-cols-2 gap-8">
      {/* 레이더 카드 */}
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
              <Radar
                name="Score"
                dataKey="value"
                stroke={COLOR_PRIMARY}
                fill={COLOR_ACCENT}
                fillOpacity={0.45}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </ElevCard>

      {/* 개선 제안 카드 */}
      <ElevCard className="p-5">
        <h3 className="text-sm font-medium mb-3 text-center" style={{ color: COLOR_PRIMARY }}>
          개선 제안
        </h3>
        <EnhancedBullets result={result} />
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
        {result?.stt_html_url && (
          <a
            href={result.stt_html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 text-white font-semibold rounded-lg transition"
            style={{ backgroundColor: COLOR_PRIMARY }}
          >
            <ExternalLink className="w-4 h-4 text-white" />
            <span>발음 분석 결과</span>
          </a>
        )}
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

/* ======================= 개선 제안 리스트 (아이콘 포함) ======================= */
function EnhancedBullets({ result }) {
  const s = result?.scores || {};
  const f = result?.features || {};
  const items = [
    { icon: <ListChecks className="w-4 h-4" />, text: `간투사: ${f.filler_count ?? 0}회` },
    { icon: <ListChecks className="w-4 h-4" />, text: `무음 비율: ${(f.pause_ratio * 100).toFixed(1)}%` },
    { icon: <ListChecks className="w-4 h-4" />, text: `음색 안정성: ${((s.mfcc ?? 0) * 2).toFixed(1)} / 10` },
  ];
  const tip = "발화 속도/억양의 안정 구간을 유지하면서, 간투사 발생 구간을 클릭-재생해 자기 점검을 반복하면 개선 속도가 빨라집니다.";

  return (
    <div className="space-y-4">
      <ul className="text-sm text-gray-800 space-y-2">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="mt-0.5" style={{ color: COLOR_ACCENT }}>{it.icon}</span>
            <span>{it.text}</span>
          </li>
        ))}
      </ul>
      <div className="text-xs flex items-start gap-2 rounded-md bg-gray-50 p-3 border border-gray-100">
        <Lightbulb className="w-4 h-4" style={{ color: COLOR_SECONDARY }} />
        <span className="leading-5 text-gray-700">{tip}</span>
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
  const fillerOccurrences = DUMMY_FILLERS;
  const silenceIntervals = DUMMY_SILENCE;

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
          <TimelineStripMini
            segments={segments}
            fillerOccurrences={fillerOccurrences}
            silenceIntervals={silenceIntervals}
          />
        </div>
      ) : (
        <div className="space-y-8">
          <WPMChart segments={segments} band={[110, 160]} audioRef={audioRef} height={220} />
          <PitchChart segments={segments} bandScale={0.2} audioRef={audioRef} height={220} />
          <TimelineWithFiller
            segments={segments}
            fillerOccurrences={fillerOccurrences}
            silenceIntervals={silenceIntervals}
            height={160}
          />
          <MFCCOverall segments={segments} audioRef={audioRef} height={220} />
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

function TimelineStripMini({ segments, silenceIntervals = [], fillerOccurrences = [] }) {
  const data = React.useMemo(
    () => (segments || []).map((s, i) => ({ t: midSec(s.time_range, i), y: 0, idx: i })),
    [segments]
  );

  const areaFill = 'rgba(86,134,196,0.15)'; // COLOR_PRIMARY with opacity

  return (
    <section>
      <div className="flex items-center justify-between mb-1">
        <h5 className="font-semibold">침묵/간투사 스트립</h5>
        <span className="text-xs text-gray-500">회색: 침묵 • 점: 간투사</span>
      </div>
      <div style={{ width: "100%", height: 180 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 4" horizontal={false} vertical={false} strokeOpacity={0.2} />
            <XAxis dataKey="t" tickFormatter={(v) => `${v.toFixed(0)}s`} fontSize={11} height={20}/>
            <YAxis type="number" domain={[0, 1]} tick={false} axisLine={false} tickLine={false} />
            <Tooltip formatter={() => ["", ""]} labelFormatter={(v) => `t=${Number(v).toFixed(2)}s`} />
            <Line type="monotone" dataKey="y" dot={false} strokeOpacity={0} />
            {silenceIntervals.map((iv, i) => (
              <ReferenceArea key={i} x1={iv.start_sec} x2={iv.end_sec} fill={areaFill} />
            ))}
            {fillerOccurrences.map((f, i) => (
              <ReferenceDot
                key={i}
                x={f.time_sec}
                y={0}
                r={4}
                label={{ value: f.word, position: "top", fontSize: 11, fill: COLOR_SECONDARY }}
                fill={COLOR_SECONDARY}
                stroke={COLOR_SECONDARY}
              />
            ))}
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
    const vals = data.map(d => d.wpm).concat(band);
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

  const bandFill = 'rgba(62,180,137,0.12)'; // COLOR_ACCENT with opacity

  return (
    <section>
      <SectionTitle
        icon={<Volume2 />}
        title="구간별 발화 속도 (WPM)"
        hint="그래프 구간을 클릭하면 해당 5초 오디오가 재생됩니다."
      />
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 12, right: 16, left: 0, bottom: 8 }} onClick={handleClick}>
            <CartesianGrid strokeDasharray="2 4" vertical={false} strokeOpacity={0.4} />
            <XAxis dataKey="t" tickFormatter={v => `${v.toFixed(0)}s`} />
            <YAxis domain={domain} />
            <Tooltip content={<TooltipWpm />} cursor={{ strokeOpacity: 0.15, strokeWidth: 20 }} />
            <Legend verticalAlign="top" align="right" wrapperStyle={{ paddingBottom: 8 }}
              formatter={(key) => ({ wpm: "발화 속도(평균)" }[key] || key)} />
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
    const vals = data.map(d => d.pitch).concat([bandMin, bandMax]);
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

  const bandFill = 'rgba(130,107,198,0.12)'; // COLOR_SECONDARY with opacity

  return (
    <section>
      <SectionTitle
        icon={<Activity />}
        title="구간별 피치(Hz)"
        hint="그래프 구간을 클릭하면 해당 5초 오디오가 재생됩니다."
      />
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 12, right: 16, left: 0, bottom: 8 }} onClick={handleClick}>
            <CartesianGrid strokeDasharray="2 4" vertical={false} strokeOpacity={0.4} />
            <XAxis dataKey="t" tickFormatter={v => `${v.toFixed(0)}s`} />
            <YAxis domain={domain} />
            <Tooltip content={<TooltipPitch />} cursor={{ strokeOpacity: 0.15, strokeWidth: 20 }} />
            <Legend verticalAlign="top" align="right" wrapperStyle={{ paddingBottom: 8 }}
              formatter={(key) => ({ pitch: "피치(평균)" }[key] || key)} />
            <ReferenceArea y1={bandMin} y2={bandMax} strokeOpacity={0} fill={bandFill} />
            <Line type="monotone" dataKey="pitch" dot={false} stroke={COLOR_PRIMARY} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function TimelineWithFiller({ segments, silenceIntervals = [], fillerOccurrences = [], height = 160 }) {
  const data = React.useMemo(() => (segments || []).map((s, i) => ({
    t: midSec(s.time_range, i), dummy: 0,
  })), [segments]);

  const areaFill = 'rgba(86,134,196,0.15)'; // COLOR_PRIMARY with opacity

  return (
    <section>
      <SectionTitle
        icon={<Slash />}
        title="침묵/발화 타임라인 & 간투사"
        hint="회색 블록은 침묵 구간, 점 라벨은 간투사 발생 지점입니다."
      />
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 12, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="2 4" horizontal={false} strokeOpacity={0.4} />
            <XAxis dataKey="t" tickFormatter={v => `${v.toFixed(0)}s`} />
            <YAxis hide />
            <Tooltip formatter={() => ["", ""]} labelFormatter={v => `t=${Number(v).toFixed(2)}s`} />
            {silenceIntervals.map((iv, i) => (
              <ReferenceArea key={i} x1={iv.start_sec} x2={iv.end_sec} fill={areaFill} />
            ))}
            {fillerOccurrences.map((f, i) => (
              <ReferenceDot key={i} x={f.time_sec} y={0} r={5}
                label={{ value: f.word, position: "top", fontSize: 11, fill: COLOR_SECONDARY }}
                fill={COLOR_SECONDARY}
                stroke={COLOR_SECONDARY}
              />
            ))}
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
    const vals = data.map(d => d.mean);
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
      <SectionTitle
        icon={<AudioLines />}
        title="시간에 따른 음색(평균)"
        hint="그래프 구간을 클릭하면 해당 5초 오디오가 재생됩니다."
      />
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 12, right: 16, left: 0, bottom: 8 }} onClick={handleClick}>
            <CartesianGrid strokeDasharray="2 4" vertical={false} strokeOpacity={0.4} />
            <XAxis dataKey="t" tickFormatter={v => `${v.toFixed(0)}s`} />
            <YAxis domain={domain} />
            <Tooltip content={<TooltipMFCC />} cursor={{ strokeOpacity: 0.15, strokeWidth: 20 }} />
            <Legend verticalAlign="top" align="right" wrapperStyle={{ paddingBottom: 8 }}
              formatter={(key) => ({ mean: "음색(평균)" }[key] || key)} />
            <Line type="monotone" dataKey="mean" dot={false} stroke={COLOR_PRIMARY} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
