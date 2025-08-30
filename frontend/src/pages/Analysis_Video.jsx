// 영상 분석 페이지 (백엔드 연동 Ver.)
// - 업로드한 동영상을 백엔드(FastAPI)로 전송하여 분석 결과(깜빡임/자세/감정)를 수신
// - 백엔드가 준비되지 않았거나 실패 시, 더미데이터로 안전하게 렌더
// - 팀원 blink summary(JSON) 포맷을 지원, 감정(3버킷 타임라인) 섹션 제거

import React, { useMemo, useRef, useState, useCallback, useEffect } from "react";
import axios from "axios";
import { motion } from "framer-motion";
import { Video as VideoIcon, ListChecks, Eye } from "lucide-react";
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

/* ===== 감정 피드백 계산(프론트 전용) ===== */
const EMO_KO = {
  angry: "분노",
  disgust: "혐오",
  scared: "두려움",
  happy: "미소",
  sad: "슬픔",
  surprised: "놀람",
  neutral: "중립",
};
const DEFAULT_STABLE_MSG = "적절하고 안정감있는 표정을 잘 유지하고 있습니다.";
const WARNING_MESSAGES = {
  angry: "화난 표정 비중이 높아요. 보다 평온하고 중립적인 표정 연습을 권합니다.",
  disgust: "불쾌한 표정 비중이 높아요. 보다 평온하고 중립적인 표정 연습을 권합니다.",
  scared: "두려운 표정 비중이 높아요. 보다 평온하고 중립적인 표정 연습을 권합니다.",
  sad: "슬픈 표정 비중이 높아요. 보다 평온하고 중립적인 표정 연습을 권합니다.",
  surprised: "놀란 표정 비중이 높아요. 보다 평온하고 중립적인 표정 연습을 권합니다.",
};
function pickMostCommonEmotion(dist) {
  if (!dist) return null;
  let top = null, topVal = -Infinity;
  for (const [k, v] of Object.entries(dist)) {
    const val = typeof v === "number" ? v : Number(v) || 0;
    if (val > topVal) { top = k; topVal = val; }
  }
  return top;
}
function computeEmotionFeedback(emotion_dist7, most_common_emotion) {
  const emo = (most_common_emotion || pickMostCommonEmotion(emotion_dist7) || "").toLowerCase();
  if (!emo) return { badge: "감정 분석", msg: "표정 신호를 전체적으로 안정적으로 사용하고 있어요.", isGood: false };
  const badge = `${EMO_KO[emo] || emo} 우세`;
  const isGood = (emo === "neutral" || emo === "happy");
  const msg = isGood ? DEFAULT_STABLE_MSG : (WARNING_MESSAGES[emo] || DEFAULT_STABLE_MSG);
  return { badge, msg, isGood };
}

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

  // 7감정 더미 분포(합=1)
  const emotion_dist7 = {
    angry:0.03, disgust:0.02, scared:0.12, happy:0.32, sad:0.06, surprised:0.05, neutral:0.40
  };

  return {
    ear, pitch,
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

/* ====== Blink Summary 정규화 & 스타일 ====== */
function normalizeBlinkSummary(raw) {
  if (!raw || typeof raw !== "object") return null;
  const K = {
    duration: raw["분석 영상 길이"] ?? raw.duration ?? raw.video_duration,
    count: raw["눈 깜빡임 횟수"] ?? raw.blink_count ?? raw.count,
    freq: raw["눈 깜빡임 빈도 (회/분)"] ?? raw.blinks_per_min ?? raw.frequency,
    grade: raw["눈 깜빡임 평가 등급"] ?? raw.blink_grade ?? raw.grade,
    interp: raw["눈 깜빡임 해석"] ?? raw.blink_interpretation ?? raw.interpretation,
  };
  const freqNum = typeof K.freq === "number" ? K.freq : parseFloat(K.freq);
  const countNum = typeof K.count === "number" ? K.count : parseInt(K.count, 10);
  return {
    duration: K.duration ?? "-", // (UI에선 사용 안 함)
    blinkCount: isNaN(countNum) ? "-" : countNum,
    blinksPerMin: isNaN(freqNum) ? "-" : Math.round(freqNum * 100) / 100,
    grade: K.grade ?? "정보 부족",
    interpretation: K.interp ?? "",
  };
}
function gradeStyle(grade) {
  switch (grade) {
    case "정상":
      return { text: "text-emerald-700", bg: "bg-emerald-50", ring: "ring-emerald-200" };
    case "주의":
      return { text: "text-amber-700", bg: "bg-amber-50", ring: "ring-amber-200" };
    case "경고":
      return { text: "text-rose-700", bg: "bg-rose-50", ring: "ring-rose-200" };
    default:
      return { text: "text-gray-700", bg: "bg-gray-50", ring: "ring-gray-200" };
  }
}

/* ====== HeadPose 정규화 (추가) ====== */
// - data.head_pose: { ratios, counts, records }
// - data.head_pose_summary: { ...ratios... }
// - data.head_pose_records: [ {time_sec, head_pose, pitch_deg}, ... ]
// - 또는 일반 필드(ratios/records/counts)만 존재해도 처리
function normalizeHeadPose(data) {
  if (!data || typeof data !== "object") return null;

  const hp = data.head_pose || null;

  const ratios =
    (hp && hp.ratios) ||
    data.head_pose_summary ||
    data.ratios ||
    null;

  const recs =
    (hp && hp.records) ||
    data.head_pose_records ||
    data.records ||
    null;

  const counts =
    (hp && hp.counts) ||
    data.head_pose_counts ||
    data.counts ||
    null;

  // 영문 → 국문 키 변환
  const toKorRatio = (r) => {
    if (!r) return null;
    const ld = r["looking down ratio"] ?? r.looking_down_ratio ?? r.down ?? 0;
    const lf = r["looking front ratio"] ?? r.looking_front_ratio ?? r.front ?? 0;
    const lu = r["looking up ratio"] ?? r.looking_up_ratio ?? r.up ?? 0;
    return {
      하: typeof ld === "number" ? ld : 0,
      정면: typeof lf === "number" ? lf : 0,
      상: typeof lu === "number" ? lu : 0,
    };
  };

  const korRatios = toKorRatio(ratios);

  // records → 초 단위 인덱스 배열로 정규화(“상/정면/하”)
  let labels = null;
  if (Array.isArray(recs) && recs.length) {
    const maxIdx = Math.max(
      ...recs.map((r, i) =>
        typeof r.time_sec === "number" ? Math.floor(r.time_sec) : i
      )
    );
    const arr = new Array(maxIdx + 1).fill("정면");
    recs.forEach((r, i) => {
      const pos = typeof r.time_sec === "number" ? Math.floor(r.time_sec) : i;
      const label =
        r.head_pose === "looking up"
          ? "상"
          : r.head_pose === "looking down"
          ? "하"
          : r.head_pose === "looking front"
          ? "정면"
          : "정면";
      if (pos >= 0 && pos < arr.length) arr[pos] = label;
    });
    labels = arr;
  }

  return {
    ratios: korRatios, // {하, 정면, 상} | null
    labels,            // ["정면","상","정면",...] | null
    counts,            // 선택 사용
  };
}

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
  // ✅ headPose 초기값 추가
  const [series, setSeries] = useState(() => ({ ...genDummySeries(DEMO_LEN), headPose: null }));
  const DURATION_SEC = series?.ear?.length || DEMO_LEN;

  // 👇 깜빡임 요약(팀원 JSON) 상태
  const [blinkSummary, setBlinkSummary] = useState(null);

  useEffect(() => {
    const prev = document.body.style.overflowY;
    if (phase === "idle" || phase === "analyzing") document.body.style.overflowY = "hidden";
    else document.body.style.overflowY = prev || "";
    return () => { document.body.style.overflowY = prev || ""; };
  }, [phase]);

  /* ========== 도메인 데이터 파생 (차트/카드 계산) ========== */
  const earData = useMemo(() => (series.ear || []).map((v, i) => ({ t: i, ear: v })), [series.ear]);
  const blinkEvents = useMemo(() => detectBlinks(series.ear || []), [series.ear]);
  const blinksPerMinLocal = useMemo(
    () => Math.round(((blinkEvents.length || 0) / Math.max(1, DURATION_SEC / 60)) * 10) / 10,
    [blinkEvents.length, DURATION_SEC]
  );

  // ✅ headPose 우선 사용
  const poseLabels = useMemo(() => {
    if (series.headPose?.labels?.length) return series.headPose.labels;
    if (series.headPose?.ratios && (series.pitch?.length || 0) > 0) {
      const r = series.headPose.ratios;
      const dominant =
        (r.정면 ?? 0) >= (r.상 ?? 0) && (r.정면 ?? 0) >= (r.하 ?? 0)
          ? "정면"
          : (r.상 ?? 0) >= (r.하 ?? 0)
          ? "상"
          : "하";
      return new Array(series.pitch.length).fill(dominant);
    }
    return (series.pitch || []).map(pitchToPose);
  }, [series.headPose, series.pitch]);

  const poseCounts = useMemo(() => {
    const c = { 상: 0, 정면: 0, 하: 0 };
    poseLabels.forEach((p) => c[p]++);
    return c;
  }, [poseLabels]);

  const poseRatio = useMemo(() => {
    if (series.headPose?.ratios) return series.headPose.ratios;
    return ratio(poseCounts);
  }, [series.headPose, poseCounts]);

  const emotionDist7 = useMemo(() => {
    if (series.emotion_dist7) return series.emotion_dist7; // 이미 ratio
    return null;
  }, [series.emotion_dist7]);

  const posePie = [
    { name: "정면", value: Math.round((poseRatio["정면"] || 0) * 100) },
    { name: "상", value: Math.round((poseRatio["상"] || 0) * 100) },
    { name: "하", value: Math.round((poseRatio["하"] || 0) * 100) },
  ];

  // 상태 배지 텍스트(깜빡임은 팀원 등급을 우선 표시)
  const poseStatus = (poseRatio["정면"] || 0) >= 0.6 ? "좋음" : (poseRatio["정면"] || 0) >= 0.45 ? "보통" : "주의";
  const blinkStatus = blinkSummary?.grade || ((blinksPerMinLocal >= 10 && blinksPerMinLocal <= 20) ? "정상" : blinksPerMinLocal < 10 ? "낮음" : "주의");

  /* ========== 업로드/분석 핸들러 ========== */
  const resetUpload = useCallback(() => {
    setFileObj(null);
    setFileName("");
    setFileUrl("");
    setProgress(0);
    setNotice("");
    setPhase("idle");
    setSeries({ ...genDummySeries(DEMO_LEN), headPose: null });
    setBlinkSummary(null);
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
      const ear = data?.ear || data?.ear_series || data?.timeline?.ear || [];
      const pitch = data?.pitch || data?.pitch_series || data?.timeline?.pitch || [];

      // 7감정 분포
      const dist = data?.distribution || null;   // {angry:0.03,...}
      const counts = data?.counts || null;       // {angry:16,...}
      let emotion_dist7 = null;

      if (dist && Object.keys(dist).length) {
        emotion_dist7 = { ...dist };
      } else if (counts && Object.keys(counts).length) {
        const total = Object.values(counts).reduce((a,b)=>a+b,0) || 1;
        emotion_dist7 = {};
        EMOTION_ORDER.forEach(k => emotion_dist7[k] = (counts[k]||0)/total);
      }

      // 경고/요약(서버 제공값은 무시 가능하지만, fallback으로 저장)
      const emotion_warning = data?.warning || "";
      const most_common_emotion = data?.most_common_emotion || null;
      const negative_ratio = (typeof data?.negative_emotion_ratio === "number")
        ? data.negative_emotion_ratio
        : (emotion_dist7
           ? (emotion_dist7.angry||0)+(emotion_dist7.disgust||0)+(emotion_dist7.scared||0)+(emotion_dist7.sad||0)+(emotion_dist7.surprised||0)
           : 0);

      // 👇 팀원 JSON 깜빡임 요약 찾기
      const rawBlink =
        data?.blink_summary ??
        data?.summary?.blink ??
        data?.blink?.summary ?? null;

      if (rawBlink) {
        setBlinkSummary(normalizeBlinkSummary(rawBlink));
      } else {
        // 서버에 요약이 없으면, 로컬 계산값으로 최소한의 더미 구성
        const localCount = detectBlinks(ear || []).length;
        const localFreq = Math.round(((localCount || 0) / Math.max(1, (ear?.length || 1) / 60)) * 10) / 10;
        setBlinkSummary(normalizeBlinkSummary({
          "눈 깜빡임 횟수": localCount,
          "눈 깜빡임 빈도 (회/분)": localFreq,
          "눈 깜빡임 평가 등급": (localFreq>=10 && localFreq<=20) ? "정상" : localFreq<10 ? "낮음" : "주의",
          "눈 깜빡임 해석": localFreq>=10 && localFreq<=20 ? "안정된 상태" : localFreq>=21 ? "약간의 긴장 상태" : "",
        }));
      }

      // ✅ 고개 각도(head pose) 파싱 (추가)
      const headPose = normalizeHeadPose({
        head_pose: data?.head_pose,
        head_pose_summary: data?.head_pose_summary,
        head_pose_records: data?.head_pose_records,
        ratios: data?.ratios,
        records: data?.records,
        counts: data?.counts,
      });

      if (!ear.length && !pitch.length && !emotion_dist7 && !headPose) {
        throw new Error("서버 응답에 분석 결과가 없습니다.(ear/pitch/distribution/head_pose)");
      }

      setSeries({
        ear,
        pitch,
        emotion_dist7,
        emotion_warning,
        most_common_emotion,
        negative_ratio,
        headPose, // ✅ 추가
      });

      setProgress(100);
      setPhase("done");
    } catch (err) {
      console.error(err);
      setNotice(
        "분석 API 호출 실패 → 예시 데이터로 표시합니다. 엔드포인트/파라미터를 확인해주세요."
      );
      setSeries({ ...genDummySeries(DEMO_LEN), headPose: null });
      setBlinkSummary(normalizeBlinkSummary({
        "눈 깜빡임 횟수": 12,
        "눈 깜빡임 빈도 (회/분)": 22.3,
        "눈 깜빡임 평가 등급": "주의",
        "눈 깜빡임 해석": "약간의 긴장 상태",
      }));
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

  // ✅ 프론트 계산 감정 배지/문구(+ good 여부)
  const { badge: emotionBadge, msg: emotionMsg, isGood: isEmotionGood } = computeEmotionFeedback(
    series.emotion_dist7,
    series.most_common_emotion
  );

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

              {/* 머리방향 스트립 */}
              <StripRow
                label="머리방향"
                data={poseLabels}
                colorOf={(p) => (p === "상" ? STRIP_UP : p === "하" ? STRIP_DOWN : STRIP_FRONT)}
                onClickIndex={seekTo}
                tooltipOf={(p) => (p === "상" ? "고개를 위로 든 상태" : p === "하" ? "고개를 아래로 숙인 상태" : "시선이 정면")}
              />

              {/* 👁️ 눈 깜빡임 섹션 */}
              <div className="mt-6 rounded-xl border p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-800">
                  <Eye className="h-4 w-4 text-gray-500" />
                  <span>눈 깜빡임</span>
                </div>
                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={earData}
                      onClick={(e) => e && typeof e.activeLabel === "number" && seekTo(e.activeLabel)}
                      margin={{ top: 10, right: 12, bottom: 8, left: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="t" tickFormatter={secToMMSS} interval={Math.floor(DURATION_SEC / 6)} />
                      <YAxis domain={[0.05, 0.4]} />
                      <RechartsTooltip
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          const val = payload[0]?.value;
                          return (
                            <div className="rounded-md bg-white/95 backdrop-blur border px-3 py-2 text-sm shadow">
                              <div className="font-medium">{secToMMSS(label)} · 눈 깜빡임</div>
                              <div className="text-gray-500">EAR {val}</div>
                              <div className="text-xs text-gray-400">값이 낮을수록 눈이 감김</div>
                            </div>
                          );
                        }}
                      />
                      <ReferenceArea y1={0.18} y2={0.32} fill={COLOR_ACCENT} fillOpacity={0.08} />
                      <Line
                        type="monotone"
                        dataKey="ear"
                        stroke={COLOR_SECONDARY}
                        dot={false}
                        strokeWidth={2}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </motion.div>

            <div className="mt-8 mb-3 flex items-center gap-3">
              <span className="h-5 w-1.5 rounded-full" style={{ backgroundColor: COLOR_ALT1 }} />
              <h2 className="text-xl font-semibold text-gray-900">종합 피드백</h2>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
              {/* 고개 방향 */}
              <InsightCard title="고개 방향" subtitle="정면 유지가 좋을수록 메시지 전달이 선명해요" status={(() => {
                const r = series.headPose?.ratios || poseRatio;
                const front = r["정면"] ?? 0;
                const up = r["상"] ?? 0;
                const down = r["하"] ?? 0;
                const max = Math.max(front, up, down);
                if (max === up) return "상";
                if (max === down) return "하";
                return "정면";
              })()}
              >
                <div className="flex flex-col min-h-[340px]">
                  <div className="flex-1 h-[220px] flex items-center justify-center">
                    <div className="w-[240px] h-[220px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={[
                            { name: "정면", value: Math.round((poseRatio["정면"] || 0) * 100) },
                            { name: "상", value: Math.round((poseRatio["상"] || 0) * 100) },
                            { name: "하", value: Math.round((poseRatio["하"] || 0) * 100) },
                          ]} dataKey="value" nameKey="name" innerRadius={40} outerRadius={85} labelLine={false} label={posePieLabel}>
                            <Cell fill={STRIP_FRONT} />
                            <Cell fill={STRIP_UP} />
                            <Cell fill={STRIP_DOWN} />
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* ✅ 최대 비율만 보고 단일 코멘트 */}
                  {(() => {
                    const r = series.headPose?.ratios || poseRatio;
                    const front = r["정면"] ?? 0;
                    const up = r["상"] ?? 0;
                    const down = r["하"] ?? 0;
                    const max = Math.max(front, up, down);
                    const isPoseGood = (max === front);
                    return (
                      <FeedbackBoxEmph tone={isPoseGood ? "good" : "warn"}>
                        {max === up
                          ? <>고개를 드는 비율이 높아 개선이 필요합니다.</>
                          : max === down
                          ? <>고개를 숙이는 비율이 높아 개선이 필요합니다.</>
                          : <>정면을 응시하는 비율이 높아 안정적입니다.</>}
                      </FeedbackBoxEmph>
                    );
                  })()}
                </div>
              </InsightCard>

              {/* 눈 깜빡임 */}
              <InsightCard title="눈 깜빡임" subtitle="깜빡임은 긴장 완화의 자연스러운 신호예요" status={blinkStatus}>
                <div className="flex flex-col min-h-[340px]">
                  <div className="grid grid-cols-2 gap-4 flex-1 items-center">
                    <div className="rounded-2xl bg-emerald-50 p-6 flex flex-col items-center justify-center shadow-sm">
                      <div className="text-sm text-emerald-700">깜빡임 횟수</div>
                      <div className="text-3xl font-bold text-gray-900 mt-1 [font-variant-numeric:tabular-nums]">
                        {blinkSummary?.blinkCount ?? "-"}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">총</div>
                    </div>

                    <div className="rounded-2xl bg-indigo-50 p-6 flex flex-col items-center justify-center shadow-sm">
                      <div className="text-sm text-indigo-700">깜빡임 빈도</div>
                      <div className="text-3xl font-bold text-gray-900 mt-1 [font-variant-numeric:tabular-nums]">
                        {blinkSummary?.blinksPerMin ?? "-"}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">회/분</div>
                    </div>
                  </div>

                  <FeedbackBoxEmph tone={blinkStatus === "정상" ? "good" : "warn"}>
                    {blinkSummary?.interpretation ||
                      (blinksPerMinLocal >= 10 && blinksPerMinLocal <= 20
                        ? "안정된 상태"
                        : blinksPerMinLocal >= 21
                        ? "약간의 긴장 상태"
                        : "깜빡임 빈도가 낮습니다. 건조하지 않도록 주의하세요.")}
                  </FeedbackBoxEmph>
                </div>
              </InsightCard>

              {/* 표정/감정 (7감정) */}
              <InsightCard title="표정/감정" subtitle="밝은 표정은 친화감을 높여요" status={emotionBadge}>
                <div className="flex flex-col min-h-[340px]">
                  <div className="flex-1 h-[220px] grid grid-cols-1 gap-4 sm:grid-cols-2 items-center">
                    <div className="h-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={EMOTION_ORDER.map((k) => ({
                              key: k,
                              name: EMO_LABEL[k],
                              value: Math.round(((series.emotion_dist7?.[k] ?? 0) * 100)),
                            }))}
                            dataKey="value"
                            nameKey="name"
                            outerRadius={85}
                          >
                            {EMOTION_ORDER.map((k) => (
                              <Cell key={k} fill={EMO_COLOR7[k]} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="text-sm space-y-1">
                      {EMOTION_ORDER.map((k) => (
                        <RowKV key={k} k={EMO_LABEL[k]} v={`${Math.round(((series.emotion_dist7?.[k] ?? 0) * 100))}%`} />
                      ))}
                    </div>
                  </div>

                  <FeedbackBoxEmph tone={isEmotionGood ? "good" : "warn"}>
                    {emotionMsg}
                  </FeedbackBoxEmph>
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
        <span
          className={`rounded-full bg-gray-100 px-3 py-1 text-xs font-medium ${
            status === "정상"
              ? "text-emerald-600"
              : status === "주의"
              ? "text-amber-600"
              : status === "경고"
              ? "text-rose-600"
              : "text-gray-700"
          }`}
        >
          {status}
        </span>
      </div>
      {children}
    </motion.div>
  );
}

function FeedbackBoxEmph({ children, tone = "warn" }) {
  const cls =
    tone === "good"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-amber-200 bg-amber-50 text-amber-800";
  return (
    <div className="mt-auto">
      <div className={`rounded-lg border p-3 text-sm text-center shadow-sm ${cls}`}>
        {children}
      </div>
    </div>
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
