// 영상 분석 페이지

import React, { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { Video as VideoIcon, ListChecks } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ReferenceArea,
  PieChart,
  Pie,
  Cell,
} from "recharts";

/* ===================== Colors ===================== */
const COLOR_PRIMARY = "#5686C4";
const COLOR_SECONDARY = "#826BC6";
const COLOR_ALT1 = "#6EAED5"; // 섹션 바
const COLOR_ACCENT = "#3EB489"; // 라인차트 허용대역
const COLOR_START = "#7FB77E"; // 시작 버튼 (흰 글자)

const STRIP_UP = "#F9D2D2";     // 상
const STRIP_FRONT = "#D9F1E4";  // 정면
const STRIP_DOWN = "#D6E2FB";   // 하

const EMO_POS = "#FFE6A7";
const EMO_NEU = "#E8E8EA";
const EMO_NEG = "#FAD4D8";

/* ===================== Helpers ===================== */
const secToMMSS = (s) => {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const r = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${r}`;
};

function genDummySeries(len = 118) {
  // EAR (깜빡임 시 급락)
  const ear = Array.from({ length: len }, (_, i) => {
    const base = 0.23 + 0.03 * Math.sin(i / 25);
    const blink = [22, 38, 43, 61, 74, 83, 95, 111].includes(i) ? -0.11 : 0;
    return Math.max(0.08, +(base + blink).toFixed(3));
  });
  // pitch: 상/정면/하 구분용 더미
  const pitch = Array.from({ length: len }, (_, i) => 8 * Math.sin(i / 20) + (i < 25 ? 5 : i > 85 ? -6 : 0));
  // 감정 더미
  const emoBlocks = [
    { label: "positive", until: 35 },
    { label: "neutral", until: 70 },
    { label: "positive", until: 95 },
    { label: "neutral", until: 110 },
    { label: "positive", until: len - 1 },
  ];
  let idx = 0;
  const emotion = [];
  for (let t = 0; t < len; t++) {
    if (t > emoBlocks[idx].until && idx < emoBlocks.length - 1) idx++;
    emotion.push(emoBlocks[idx].label);
  }
  return { ear, pitch, emotion };
}

function detectBlinks(earSeries, thr = 0.19, refractory = 5) {
  const events = [];
  let cool = 0;
  earSeries.forEach((v, t) => {
    if (cool > 0) { cool--; return; }
    if (v < thr) { events.push({ t, ear: v }); cool = refractory; }
  });
  return events;
}

function ratio(counts) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  const out = {};
  Object.entries(counts).forEach(([k, v]) => out[k] = +(v / total).toFixed(2));
  return out;
}

const pitchToPose = (p) => (p > 8 ? "상" : p < -8 ? "하" : "정면");

// Pie 내부 라벨
const RADIAN = Math.PI / 180;
const posePieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }) => {
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="#374151" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 12, fontWeight: 600 }}>
      {name} {Math.round(percent * 100)}%
    </text>
  );
};

/* ===================== Main ===================== */
export default function Analysis_Video() {
  // phase: idle → analyzing → done
  const [phase, setPhase] = useState("idle");

  // 분석 전 스크롤바 숨김 (헤더는 유지)
  useEffect(() => {
    const prev = document.body.style.overflowY;
    if (phase === "idle" || phase === "analyzing") document.body.style.overflowY = "hidden";
    else document.body.style.overflowY = prev || "";
    return () => { document.body.style.overflowY = prev || ""; };
  }, [phase]);

  // Upload state
  const videoRef = useRef(null);
  const [fileUrl, setFileUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [progress, setProgress] = useState(0);

  // Dummy analytics
  const DURATION_SEC = 118;
  const { ear, pitch, emotion } = useMemo(() => genDummySeries(DURATION_SEC), []);
  const earData = useMemo(() => ear.map((v, i) => ({ t: i, ear: v })), [ear]);
  const blinkEvents = useMemo(() => detectBlinks(ear), [ear]);
  const blinksPerMin = Math.round((blinkEvents.length / (DURATION_SEC / 60)) * 10) / 10;
  const avgEar = Math.round((ear.reduce((a, b) => a + b, 0) / ear.length) * 1000) / 1000;

  const poseLabels = useMemo(() => pitch.map(pitchToPose), [pitch]);
  const poseCounts = useMemo(() => {
    const c = { 상: 0, 정면: 0, 하: 0 };
    poseLabels.forEach((p) => c[p]++);
    return c;
  }, [poseLabels]);
  const poseRatio = useMemo(() => ratio(poseCounts), [poseCounts]);

  const emoCounts = useMemo(() => {
    const c = { positive: 0, neutral: 0, negative: 0 };
    emotion.forEach((e) => c[e]++);
    return c;
  }, [emotion]);
  const emoRatio = useMemo(() => ratio(emoCounts), [emoCounts]);
  const dominantEmo = Object.entries(emoRatio).sort((a, b) => b[1] - a[1])[0][0];

  const blinkStatus = blinksPerMin >= 10 && blinksPerMin <= 20 ? "적절" : blinksPerMin < 10 ? "낮음" : "높음";
  const poseStatus = (poseRatio["정면"] || 0) >= 0.6 ? "좋음" : (poseRatio["정면"] || 0) >= 0.45 ? "보통" : "주의";
  const emoStatus = dominantEmo === "positive" ? "친화적" : dominantEmo === "neutral" ? "중립" : "부정";

  const posePie = [
    { name: "정면", value: Math.round((poseRatio["정면"] || 0) * 100) },
    { name: "상", value: Math.round((poseRatio["상"] || 0) * 100) },
    { name: "하", value: Math.round((poseRatio["하"] || 0) * 100) },
  ];
  const emoPie = [
    { name: "Positive", value: Math.round(emoRatio.positive * 100) },
    { name: "Neutral", value: Math.round(emoRatio.neutral * 100) },
    { name: "Negative", value: Math.round(emoRatio.negative * 100) },
  ];

  // 타임라인 스트립 툴팁
  const poseTooltipOf = (p) => (p === "상" ? "고개를 위로 든 상태" : p === "하" ? "고개를 아래로 숙인 상태" : "시선이 정면");
  const emoTooltipOf = (e) => (e === "positive" ? "밝은 표정" : e === "negative" ? "긴장된 표정" : "중립 표정");

  // Handlers
  const resetUpload = useCallback(() => {
    setFileName(""); setFileUrl(""); setProgress(0); setPhase("idle");
  }, []);
  const handleFilePick = useCallback((file) => {
    if (!file) return;
    setFileName(file.name);
    const url = URL.createObjectURL(file);
    setFileUrl(url);
  }, []);
  const analyze = useCallback(async () => {
    if (!fileUrl) return;
    setPhase("analyzing"); setProgress(0);
    const timer = setInterval(() => setProgress((p) => Math.min(100, p + 7)), 160);
    await new Promise((r) => setTimeout(r, 2200));
    clearInterval(timer); setProgress(100); setPhase("done");
  }, [fileUrl]);
  const onRestart = useCallback(() => {
    if (videoRef.current) { videoRef.current.currentTime = 0; videoRef.current.pause(); }
    window.scrollTo({ top: 0, behavior: "smooth" });
    resetUpload();
  }, [resetUpload]);
  const seekTo = (sec) => {
    if (videoRef.current && phase === "done") {
      videoRef.current.currentTime = Math.max(0, Math.min(sec, DURATION_SEC - 1));
      videoRef.current.play();
    }
  };

  // Demo warning
  const tiltDownWarn = true;
  const tiltDownPct = 6;

  return (
    <div className="bg-gradient-to-b from-white to-[#f7f9fc]">
      <div className={`mx-auto max-w-7xl px-5 ${phase !== "done" ? "pt-8 pb-0" : "py-8"}`}>

        {/* 업로드 전/분석중 */}
        {(phase === "idle" || phase === "analyzing") && (
          <div className="mx-auto max-w-xl">
            <UploadBoxUnified
              fileName={fileName}
              isAnalyzing={phase === "analyzing"}
              progress={progress}
              onPick={handleFilePick}
              onStart={analyze}
              onReset={resetUpload}
            />
          </div>
        )}

        {/* 분석 완료 */}
        {phase === "done" && (
          <>
            {/* 상단: 업로드(좌) + 사용자 영상(우) */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <UploadBoxUnified compact fileName={fileName} isAnalyzing={false} progress={100} onPick={handleFilePick} onStart={analyze} onReset={resetUpload} />
              </div>
              <div>
                <div className="rounded-2xl border bg-black/5 p-3">
                  <video ref={videoRef} src={fileUrl || ""} controls className="aspect-video w-full rounded-xl bg-black" />
                  <div className="mt-3 flex items-center justify-between gap-3 text-sm text-gray-600">
                    <span className="truncate">{fileName || "영상 파일을 선택하세요"}</span>
                    <span className="rounded-full bg-white px-2 py-1">분석 완료</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 섹션 타이틀: 발표 패턴 분석 */}
            <div className="mt-8 mb-3 flex items-center gap-3">
              <span className="h-5 w-1.5 rounded-full" style={{ backgroundColor: COLOR_ALT1 }} />
              <h2 className="text-xl font-semibold text-gray-900">발표 패턴 분석</h2>
            </div>

            {/* 타임라인 */}
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">타임라인</h2>
                <span className="text-sm text-gray-500">클릭하면 해당 시점으로 이동</span>
              </div>

              <StripRow
                label="머리방향"
                data={poseLabels}
                colorOf={(p) => (p === "상" ? STRIP_UP : p === "하" ? STRIP_DOWN : STRIP_FRONT)}
                onClickIndex={seekTo}
                tooltipOf={poseTooltipOf}
              />

              <div className="mt-3 h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={earData} onClick={(e) => e && typeof e.activeLabel === "number" && seekTo(e.activeLabel)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="t" tickFormatter={secToMMSS} interval={Math.floor(DURATION_SEC / 6)} />
                    <YAxis domain={[0.05, 0.4]} />
                    <RechartsTooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const val = payload[0]?.value;
                        return (
                          <div className="rounded-md bg-white/95 backdrop-blur border px-3 py-2 text-sm shadow">
                            <div className="font-medium">{secToMMSS(label)} · EAR {val}</div>
                            <div className="text-gray-500">값이 낮을수록 눈이 감김</div>
                          </div>
                        );
                      }}
                    />
                    <ReferenceArea y1={0.18} y2={0.32} fill={COLOR_ACCENT} fillOpacity={0.08} />
                    <Line type="monotone" dataKey="ear" stroke={COLOR_SECONDARY} dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <StripRow
                className="mt-3"
                label="감정"
                data={emotion}
                colorOf={(e) => (e === "positive" ? EMO_POS : e === "negative" ? EMO_NEG : EMO_NEU)}
                onClickIndex={seekTo}
                tooltipOf={emoTooltipOf}
              />
            </motion.div>

            {/* 섹션 타이틀: 종합 피드백 */}
            <div className="mt-8 mb-3 flex items-center gap-3">
              <span className="h-5 w-1.5 rounded-full" style={{ backgroundColor: COLOR_ALT1 }} />
              <h2 className="text-xl font-semibold text-gray-900">종합 피드백</h2>
            </div>

            {/* 3카드 — 동일 높이/정렬 */}
            <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
              {/* 고개 방향 */}
              <InsightCard title="고개 방향" subtitle="정면 유지가 좋을수록 메시지 전달이 선명해요" status={poseStatus}>
                <div className="flex flex-col min-h-[340px]">
                  <div className="flex-1 h-[220px] flex items-center justify-center">
                    <div className="w-[240px] h-[220px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={posePie} dataKey="value" nameKey="name" innerRadius={40} outerRadius={85} labelLine={false} label={posePieLabel}>
                            <Cell fill={STRIP_FRONT} />
                            <Cell fill={STRIP_UP} />
                            <Cell fill={STRIP_DOWN} />
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  {tiltDownWarn && (
                    <div className="mt-auto">
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-amber-800 text-sm">
                        고개가 아래로 숙인 구간이 감지됐어요 (약 {tiltDownPct}%). 질문을 들을 때도 시선을 정면에 두면 전달력이 좋아져요.
                      </div>
                    </div>
                  )}
                </div>
              </InsightCard>

              {/* 눈 깜빡임 */}
              <InsightCard title="눈 깜빡임" subtitle="깜빡임은 긴장 완화의 자연스러운 신호예요" status={blinkStatus}>
                <div className="flex flex-col min-h-[340px]">
                  <div className="flex-1 h-[220px] flex items-center justify-center">
                    <div className="w-56 h-36 rounded-2xl bg-[rgba(62,180,137,0.08)] flex flex-col items-center justify-center text-center shadow-sm">
                      <div className="text-sm text-gray-500">깜빡임/분</div>
                      <div className="text-4xl font-semibold text-gray-900">{blinksPerMin}</div>
                      <div className="text-xs text-gray-500">평균 EAR {avgEar}</div>
                    </div>
                  </div>
                  <p className="mt-auto pt-4 text-sm text-gray-600 text-center">
                    초반 20초에 밀집된 깜빡임이 보여요. 시작 직전 복식호흡 2회로 안정도를 높여보세요.
                  </p>
                </div>
              </InsightCard>

              {/* 표정/감정 */}
              <InsightCard title="표정/감정" subtitle="밝은 표정은 친화감을 높여요" status={emoStatus}>
                <div className="flex flex-col min-h-[340px]">
                  <div className="flex-1 h-[220px] grid grid-cols-1 gap-4 sm:grid-cols-2 items-center">
                    <div className="h-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={emoPie} dataKey="value" nameKey="name" outerRadius={85}>
                            <Cell fill={EMO_POS} />
                            <Cell fill={EMO_NEU} />
                            <Cell fill={EMO_NEG} />
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="text-sm space-y-2">
                      <RowKV k="밝은(Positive)" v={`${Math.round(emoRatio.positive * 100)}%`} />
                      <RowKV k="중립(Neutral)" v={`${Math.round(emoRatio.neutral * 100)}%`} />
                      <RowKV k="긴장(Negative)" v={`${Math.round(emoRatio.negative * 100)}%`} />
                    </div>
                  </div>
                  <div className="mt-auto pt-4 rounded-lg bg-gray-50 p-2 text-sm text-gray-600">
                    질의응답 구간에서 중립 비중이 늘어납니다. 결론 요약 후 미소를 한 번 체크해 보세요.
                  </div>
                </div>
              </InsightCard>
            </div>

            {/* 하단 단독 버튼 */}
            <div className="mt-10 mb-8 flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={() => videoRef.current?.play()}
                className="rounded-lg px-6 py-3 text-sm font-medium text-white shadow-sm hover:opacity-95"
                style={{ backgroundColor: COLOR_START }}
              >
                영상 재생
              </button>
              <button
                onClick={onRestart}
                className="rounded-lg border bg-white px-6 py-3 text-sm hover:bg-gray-50"
              >
                다시 분석하기
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ===================== Reusable UI ===================== */
function RowKV({ k, v }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-600">{k}</span>
      <b>{v}</b>
    </div>
  );
}

function InsightCard({ title, subtitle, status, children }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-600">{subtitle}</p>
        </div>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700">{status}</span>
      </div>
      {children}
    </motion.div>
  );
}

function StripRow({ label, data, colorOf, onClickIndex, tooltipOf, className = "" }) {
  return (
    <div className={`rounded-xl border p-3 ${className}`}>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-800">
          <ListChecks className="h-4 w-4 text-gray-500" />
          {label}
        </div>
        <div className="text-xs text-gray-500">{data.length}s</div>
      </div>
      <div className="flex h-6 w-full overflow-hidden rounded-md">
        {data.map((d, i) => (
          <button
            key={i}
            onClick={() => onClickIndex && onClickIndex(i)}
            className="h-full flex-1"
            style={{ backgroundColor: colorOf(d) }}
            title={tooltipOf ? `${secToMMSS(i)} · ${String(d)} — ${tooltipOf(d)}` : secToMMSS(i)}
          />
        ))}
      </div>
    </div>
  );
}

/* ===================== Upload Box ===================== */
function UploadBoxUnified({ fileName, isAnalyzing, progress, onPick, onStart, onReset, compact = false }) {
  const inputRef = React.useRef(null);
  const loading = !!isAnalyzing;
  return (
    <div className={`max-w-xl mx-auto ${compact ? "p-6" : "p-8"} border border-gray-200 bg-[#f7f9fc] rounded-lg text-center shadow-sm`}>
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white">
        <VideoIcon className="w-6 h-6 text-gray-400" />
      </div>
      <h3 className="text-lg font-medium mb-2">영상 파일 업로드</h3>
      <p className="text-sm text-gray-500 mb-4">.mp4, .mov 파일 업로드 가능</p>

      <input type="file" accept="video/*" ref={inputRef} className="hidden" onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) onPick?.(file);
      }} />

      <div className="flex justify-center gap-4">
        <button onClick={() => inputRef.current?.click()} className="px-6 py-3 bg-white rounded-full border border-gray-300 hover:bg-gray-100 transition">
          영상 파일 선택
        </button>
      </div>

      {fileName && <p className="text-sm text-gray-600 mt-4">🎬 {fileName}</p>}

      <div className="mt-6 flex items-center justify-center gap-3">
        <button
          onClick={onStart}
          disabled={loading || !fileName}
          className="px-4 py-2 rounded-md text-white"
          style={{ backgroundColor: COLOR_START, opacity: loading || !fileName ? 0.7 : 1 }}
          title="분석 시작"
        >
          {loading ? "분석 중…" : "분석 시작"}
        </button>
        <button
          onClick={onReset}
          disabled={loading}
          className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
          title="초기화"
        >
          초기화
        </button>
      </div>

      {(loading || progress > 0) && (
        <div className="mt-4">
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div className="h-2 rounded-full" style={{ width: `${progress}%`, backgroundColor: COLOR_START, transition: "width 0.2s ease" }} />
          </div>
          <p className="mt-2 text-xs text-gray-500">업로드 및 분석 진행 중… {progress}%</p>
        </div>
      )}
    </div>
  );
}
