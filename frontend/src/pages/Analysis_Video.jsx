// 영상 분석 페이지 (백엔드 연동 Ver.)
// - 업로드한 동영상을 백엔드(FastAPI)로 전송하여 분석 결과(깜빡임/자세/감정)를 수신
// - 백엔드가 준비되지 않았거나 실패 시, 더미데이터로 안전하게 렌더
// - 엔드포인트만 맞추면 바로 붙도록 주석 자세히 기재

import React, { useMemo, useRef, useState, useCallback, useEffect } from "react";
import axios from "axios";
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

/* ===================== API 설정 ===================== */
const API_BASE =
  (process.env.REACT_APP_API_BASE || "http://localhost:8000").replace(/\/+$/, "");

const VIDEO_ENDPOINT = "/analyze-video";

/* ===================== Colors ===================== */
const COLOR_PRIMARY = "#5686C4";
const COLOR_SECONDARY = "#826BC6";
const COLOR_ALT1 = "#6EAED5"; // 섹션 바
const COLOR_ACCENT = "#3EB489"; // 라인차트 허용대역
const COLOR_START = "#7FB77E"; // 시작 버튼

const STRIP_UP = "#F9D2D2";     // 상
const STRIP_FRONT = "#D9F1E4";  // 정면
const STRIP_DOWN = "#D6E2FB";   // 하

// 3버킷 색상(타임라인에 사용)
const EMO_POS = "#FFE6A7";
const EMO_NEU = "#E8E8EA";
const EMO_NEG = "#FAD4D8";

/* ===== 7감정 메타 ===== */
const EMOTION_ORDER = ["angry","disgust","scared","happy","sad","surprised","neutral"];
const EMO_LABEL = {
  angry:"분노(Angry)", disgust:"혐오(Disgust)", scared:"두려움(Scared)",
  happy:"행복(Happy)", sad:"슬픔(Sad)", surprised:"놀람(Surprised)", neutral:"중립(Neutral)"
};
const EMO_COLOR7 = {
  angry:"#F8C7C7", disgust:"#CFE8D9", scared:"#DAD1F3",
  happy:"#FBE5B5", sad:"#D6E8FA", surprised:"#FADBC6", neutral:"#E6EEF5"
};

/* ===================== Helpers ===================== */
const secToMMSS = (s) => {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const r = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${r}`;
};

// 더미 시리즈 생성 — 백엔드 실패시 화면을 살리는 fallback
function genDummySeries(len = 118) {
  const ear = Array.from({ length: len }, (_, i) => {
    const base = 0.23 + 0.03 * Math.sin(i / 25);
    const blink = [22, 38, 43, 61, 74, 83, 95, 111].includes(i) ? -0.11 : 0;
    return Math.max(0.08, +(base + blink).toFixed(3));
  });
  const pitch = Array.from({ length: len }, (_, i) => 8 * Math.sin(i / 20) + (i < 25 ? 5 : i > 85 ? -6 : 0));
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

  // 7감정 더미 분포(합=1)
  const emotion_dist7 = {
    angry:0.03, disgust:0.02, scared:0.12, happy:0.32, sad:0.06, surprised:0.05, neutral:0.40
  };

  return {
    ear, pitch, emotion,
    emotion_dist7,
    emotion_warning: "질의응답에서 중립 비중이 늘어납니다. 결론 요약 후 미소를 한 번 체크해 보세요.",
    most_common_emotion: "neutral",
    negative_ratio: emotion_dist7.angry + emotion_dist7.disgust + emotion_dist7.scared + emotion_dist7.sad + emotion_dist7.surprised,
  };
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
  const [phase, setPhase] = useState("idle");

  const videoRef = useRef(null);
  const [fileObj, setFileObj] = useState(null);
  const [fileUrl, setFileUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [progress, setProgress] = useState(0);

  const [notice, setNotice] = useState("");

  const DEMO_LEN = 118;
  const [series, setSeries] = useState(() => genDummySeries(DEMO_LEN));
  const DURATION_SEC = series?.ear?.length || DEMO_LEN;

  useEffect(() => {
    const prev = document.body.style.overflowY;
    if (phase === "idle" || phase === "analyzing") document.body.style.overflowY = "hidden";
    else document.body.style.overflowY = prev || "";
    return () => { document.body.style.overflowY = prev || ""; };
  }, [phase]);

  /* ========== 도메인 데이터 파생 (차트/카드 계산) ========== */
  const earData = useMemo(() => (series.ear || []).map((v, i) => ({ t: i, ear: v })), [series.ear]);
  const blinkEvents = useMemo(() => detectBlinks(series.ear || []), [series.ear]);
  const blinksPerMin = useMemo(
    () => Math.round(((blinkEvents.length || 0) / Math.max(1, DURATION_SEC / 60)) * 10) / 10,
    [blinkEvents.length, DURATION_SEC]
  );
  const avgEar = useMemo(() => {
      const arr = series.ear || [];
      if (!arr.length) return 0;
      return Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 1000) / 1000;
    },
    [series.ear]
  );

  const poseLabels = useMemo(() => (series.pitch || []).map(pitchToPose), [series.pitch]);
  const poseCounts = useMemo(() => {
    const c = { 상: 0, 정면: 0, 하: 0 };
    poseLabels.forEach((p) => c[p]++);
    return c;
  }, [poseLabels]);
  const poseRatio = useMemo(() => ratio(poseCounts), [poseCounts]);

  /* ===== 7감정 분포(백엔드 distribution/counts → ratio로 변환) ===== */
  const emotionDist7 = useMemo(() => {
    if (series.emotion_dist7) return series.emotion_dist7; // 이미 ratio로 저장된 경우
    return null;
  }, [series.emotion_dist7]);

  // 3버킷 요약(7감정 → P/N/N)
  const emoRatio = useMemo(() => {
    const d = emotionDist7 || {};
    const positive = d.happy ?? 0;
    const neutral = d.neutral ?? 0;
    const negative =
      (d.angry ?? 0) + (d.disgust ?? 0) + (d.scared ?? 0) + (d.sad ?? 0) + (d.surprised ?? 0);
    return { positive, neutral, negative };
  }, [emotionDist7]);

  const dominantEmo =
    Object.entries(emoRatio).sort((a, b) => b[1] - a[1])[0]?.[0] || "neutral";

  const blinkStatus = blinksPerMin >= 10 && blinksPerMin <= 20 ? "적절" : blinksPerMin < 10 ? "낮음" : "높음";
  const poseStatus = (poseRatio["정면"] || 0) >= 0.6 ? "좋음" : (poseRatio["정면"] || 0) >= 0.45 ? "보통" : "주의";
  const emoStatus = dominantEmo === "positive" ? "친화적" : dominantEmo === "neutral" ? "중립" : "부정";

  const posePie = [
    { name: "정면", value: Math.round((poseRatio["정면"] || 0) * 100) },
    { name: "상", value: Math.round((poseRatio["상"] || 0) * 100) },
    { name: "하", value: Math.round((poseRatio["하"] || 0) * 100) },
  ];

  // 7감정 파이
  const emoPie7 = EMOTION_ORDER.map((k) => ({
    key: k, name: EMO_LABEL[k], value: Math.round(((emotionDist7?.[k] ?? 0) * 100))
  }));

  // 타임라인 스트립 툴팁
  const poseTooltipOf = (p) => (p === "상" ? "고개를 위로 든 상태" : p === "하" ? "고개를 아래로 숙인 상태" : "시선이 정면");

  /* ========== 업로드/분석 핸들러 ========== */
  const resetUpload = useCallback(() => {
    setFileObj(null);
    setFileName("");
    setFileUrl("");
    setProgress(0);
    setNotice("");
    setPhase("idle");
    setSeries(genDummySeries(DEMO_LEN));
  }, []);

  const handleFilePick = useCallback((file) => {
    if (!file) return;
    setFileObj(file);
    setFileName(file.name);
    const url = URL.createObjectURL(file);
    setFileUrl(url);
    setNotice("");
  }, []);

  const analyze = useCallback(async () => {
    if (!fileObj) return;

    try {
      setPhase("analyzing");
      setProgress(0);
      setNotice("");

      const fd = new FormData();
      fd.append("video", fileObj);

      const { data } = await axios.post(`${API_BASE}${VIDEO_ENDPOINT}`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e) => {
          if (e.total) {
            const pct = Math.round((e.loaded / e.total) * 100);
            setProgress(Math.min(99, Math.max(1, pct)));
          }
        },
        timeout: 300000,
      });

      // ====== 응답 파싱 ======
      // 시계열(있을 수도/없을 수도)
      const ear = data?.ear || data?.ear_series || data?.timeline?.ear || [];
      const pitch = data?.pitch || data?.pitch_series || data?.timeline?.pitch || [];
      let emotionTimeline = data?.emotion || data?.emotion_series || data?.timeline?.emotion || [];

      // 7감정 분포
      const dist = data?.distribution || null;   // {angry:0.03,...}
      const counts = data?.counts || null;       // {angry:16,...}
      let emotion_dist7 = null;

      if (dist && Object.keys(dist).length) {
        // 이미 ratio인 경우 그대로 사용
        emotion_dist7 = { ...dist };
      } else if (counts && Object.keys(counts).length) {
        const total = Object.values(counts).reduce((a,b)=>a+b,0) || 1;
        emotion_dist7 = {};
        EMOTION_ORDER.forEach(k => emotion_dist7[k] = (counts[k]||0)/total);
      }

      // 경고/요약
      const emotion_warning = data?.warning || "";
      const most_common_emotion = data?.most_common_emotion || null;
      const negative_ratio = (typeof data?.negative_emotion_ratio === "number")
        ? data.negative_emotion_ratio
        : (emotion_dist7
           ? (emotion_dist7.angry||0)+(emotion_dist7.disgust||0)+(emotion_dist7.scared||0)+(emotion_dist7.sad||0)+(emotion_dist7.surprised||0)
           : 0);

      // 이전 3버킷 타임라인과 호환되는 문자열 표준화
      emotionTimeline = (emotionTimeline || []).map((x) => {
        const v = (typeof x === "string" ? x.toLowerCase() : x);
        if (v === "pos" || v === "positive" || v === 1) return "positive";
        if (v === "neg" || v === "negative" || v === -1) return "negative";
        return "neutral";
      });

      if (!ear.length && !pitch.length && !emotion_dist7) {
        throw new Error("서버 응답에 분석 결과가 없습니다.(ear/pitch/distribution)");
      }

      setSeries({
        ear,
        pitch,
        emotion: emotionTimeline,    // 3버킷 타임라인(있으면 스트립에 사용)
        emotion_dist7,               // 7감정 분포(파이/스트립에 사용)
        emotion_warning,
        most_common_emotion,
        negative_ratio,
      });

      setProgress(100);
      setPhase("done");
    } catch (err) {
      console.error(err);
      setNotice(
        "백엔드 분석 API 호출에 실패하여 예시 데이터로 표시합니다. " +
        "엔드포인트/파라미터를 확인해주세요."
      );
      setSeries(genDummySeries(DEMO_LEN));
      setProgress(100);
      setPhase("done");
    }
  }, [fileObj]);

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

  // (예시) 아래 경고는 실제 로직으로 교체 가능
  const tiltDownWarn = true;
  const tiltDownPct = 6;

  return (
    <div className="bg-gradient-to-b from-white to-[#f7f9fc]">
      <div className={`mx-auto max-w-7xl px-5 ${phase !== "done" ? "pt-8 pb-0" : "py-8"}`}>

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

        {phase === "done" && (
          <>
            {notice && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                {notice}
                <div className="text-xs text-amber-800 mt-1">
                  현재 VIDEO_ENDPOINT: <b>{VIDEO_ENDPOINT}</b> · API_BASE: <b>{API_BASE}</b>
                </div>
              </div>
            )}

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

              {/* 감정 스트립: 7감정 분포 기반(시간축 없이 비율로 구획) */}
              <div className="mt-3">
                <EmotionStrip
                  label="감정(7분포)"
                  dist7={series.emotion_dist7}
                />
              </div>

              {/* 기존 3버킷 타임라인이 있다면 그대로 보여주고 싶을 때 아래 유지 */}
              {Array.isArray(series.emotion) && series.emotion.length > 0 && (
                <StripRow
                  className="mt-3"
                  label="감정(3버킷 타임라인)"
                  data={series.emotion}
                  colorOf={(e) => (e === "positive" ? EMO_POS : e === "negative" ? EMO_NEG : EMO_NEU)}
                  onClickIndex={seekTo}
                  tooltipOf={(e) => (e === "positive" ? "밝은 표정" : e === "negative" ? "긴장된 표정" : "중립 표정")}
                />
              )}
            </motion.div>

            <div className="mt-8 mb-3 flex items-center gap-3">
              <span className="h-5 w-1.5 rounded-full" style={{ backgroundColor: COLOR_ALT1 }} />
              <h2 className="text-xl font-semibold text-gray-900">종합 피드백</h2>
            </div>

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
                  <div className="mt-auto">
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-amber-800 text-sm">
                      고개가 아래로 숙인 구간이 감지됐어요 (약 {tiltDownPct}%). 질문을 들을 때도 시선을 정면에 두면 전달력이 좋아져요.
                    </div>
                  </div>
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

              {/* 표정/감정 (7감정) */}
              <InsightCard title="표정/감정" subtitle="밝은 표정은 친화감을 높여요" status={emoStatus}>
                <div className="flex flex-col min-h-[340px]">
                  <div className="flex-1 h-[220px] grid grid-cols-1 gap-4 sm:grid-cols-2 items-center">
                    <div className="h-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={emoPie7} dataKey="value" nameKey="name" outerRadius={85}>
                            {EMOTION_ORDER.map((k) => (
                              <Cell key={k} fill={EMO_COLOR7[k]} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="text-sm space-y-1">
                      {EMOTION_ORDER.map((k) => (
                        <RowKV key={k} k={EMO_LABEL[k]} v={`${Math.round(((emotionDist7?.[k] ?? 0) * 100))}%`} />
                      ))}
                    </div>
                  </div>
                  <div className="mt-auto pt-4 rounded-lg bg-gray-50 p-2 text-sm text-gray-600">
                    {series.emotion_warning || "표정 신호를 전체적으로 안정적으로 사용하고 있어요."}
                  </div>
                </div>
              </InsightCard>
            </div>

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

/* ===== 7감정 분포 스트립(시간정보 없이 비율로 구획) ===== */
function EmotionStrip({ label = "감정", dist7 }) {
  const segments = useMemo(() => {
    if (!dist7) return [];
    return EMOTION_ORDER
      .map((k) => ({ key: k, widthPct: (dist7[k] || 0) * 100, color: EMO_COLOR7[k], label: EMO_LABEL[k] }))
      .filter((s) => s.widthPct > 0);
  }, [dist7]);

  const totalPct = Math.round(segments.reduce((a,b)=>a+b.widthPct,0));
  return (
    <div className="rounded-xl border p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-800">
          <ListChecks className="h-4 w-4 text-gray-500" />
          {label}
        </div>
        <div className="text-xs text-gray-500">{totalPct}%</div>
      </div>
      <div className="flex h-6 w-full overflow-hidden rounded-md">
        {segments.map((seg) => (
          <div
            key={seg.key}
            style={{ width: `${seg.widthPct}%`, backgroundColor: seg.color }}
            title={`${seg.label} ${seg.widthPct.toFixed(1)}%`}
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
