// 내용 분석 페이지 (백엔드 연동 완료, 레이더차트만 연동하면 됨)

import React, { useMemo, useRef, useState, useEffect } from 'react';
import axios from 'axios';
import {
  ExternalLink, FileText, Hash, ListChecks, ClipboardCopy, Wand2
} from 'lucide-react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, ResponsiveContainer
} from 'recharts';

// ===================== 환경 설정(CRA/Vite 공통) =====================
const API_BASE =
  (typeof process !== 'undefined' &&
    process.env &&
    process.env.REACT_APP_API_BASE &&
    process.env.REACT_APP_API_BASE.replace(/\/+$/, '')) ||
  'http://localhost:8000';

// 상대경로 html_url을 절대경로로 보정 (선택)
const resolveUrl = (u) => {
  if (!u) return '';
  if (u.startsWith('http://') || u.startsWith('https://')) return u;
  return `${API_BASE}${u.startsWith('/') ? u : `/${u}`}`;
};

// 프론트 UI 색상
const COLOR_PRIMARY = '#6EAED5';   // 교정문 복사 버튼
const COLOR_SECONDARY = '#A68ED5'; // 분석 시작/링크 버튼

// ===================== 보조 유틸 =====================
// 서버가 "강조 HTML"을 안 주는 경우 대비한 간단 하이라이트(옵션)
function naiveHighlight(original = '', corrected = '') {
  if (!original || !corrected) return corrected;
  try {
    const o = original.split(/\s+/);
    const c = corrected.split(/\s+/);
    const map = new Map();
    o.forEach((w) => map.set(w, (map.get(w) || 0) + 1));
    return c
      .map((w) => {
        const left = map.get(w) || 0;
        if (left > 0) {
          map.set(w, left - 1);
          return w;
        }
        return `<span style="color:red;font-weight:bold;">${w}</span>`;
      })
      .join(' ');
  } catch {
    return corrected;
  }
}

// 강조된 단어(span style="color:red") 개수를 세어 오류/수정 개수 근사치로 사용
function countHighlightedSpans(html = '') {
  return (html.match(/<span[^>]*style=["'][^"']*color:\s*red/gi) || []).length;
}

// ===================== 컴포넌트 =====================
export default function Analysis_Content() {
  // === [업로드 박스] ===
  const scriptInputRef = useRef(null);
  const [fileInfo, setFileInfo] = useState({ script: null });

  // 요청/응답 상태
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);                  // [PROGRESS] 서버 진행률 %
  const [progressMessage, setProgressMessage] = useState('');   // [PROGRESS] 서버 메시지
  const [error, setError] = useState(null);

  // 결과 데이터
  const [originalText, setOriginalText] = useState('');
  const [correctedText, setCorrectedText] = useState('');
  const [highlightedHtml, setHighlightedHtml] = useState(''); // 서버가 준 강조 HTML(또는 폴백)
  const [feedbackText, setFeedbackText] = useState('');       // AI 피드백 텍스트(옵션)
  const [htmlUrl, setHtmlUrl] = useState('');                 // corrected_result.html 접근 URL

  // 탭 상태
  const [tab, setTab] = useState('original'); // 'original' | 'corrected'

  // 간단 통계
  const stats = useMemo(() => {
    const wc = correctedText ? correctedText.trim().split(/\s+/).filter(Boolean).length : 0;
    const errorCount = countHighlightedSpans(highlightedHtml);
    const avgErrors = wc > 0 ? errorCount / Math.max(1, Math.round(wc / 20)) : 0; // 문장 20단어 가정
    return { wordCount: wc, errorCount, avgErrors: Number(avgErrors.toFixed(2)) };
  }, [correctedText, highlightedHtml]);

  // 레이더(임시) - 시연용 계산치
  const radarData = useMemo(() => {
    const penalty = Math.min(10, countHighlightedSpans(highlightedHtml) / 5);
    const base = 8.5 - penalty * 0.5;
    const clamp = (n) => Math.max(0, Math.min(10, n));
    return [
      { subject: '논리성', A: clamp(base + 0.2), fullMark: 10 },
      { subject: '구조화', A: clamp(base - 0.1), fullMark: 10 },
      { subject: '간결성', A: clamp(base - 0.2), fullMark: 10 },
      { subject: '전달력', A: clamp(base + 0.1), fullMark: 10 },
      { subject: '일관성', A: clamp(base),       fullMark: 10 },
    ];
  }, [highlightedHtml]);

  // 언마운트 시 폴링 정리
  useEffect(() => {
    return () => {
      // 컴포넌트가 사라질 때 setInterval 정리 (handleRun 내부에서 관리하므로 여기선 보조용)
    };
  }, []);

  // 초기화
  const resetAll = () => {
    setFileInfo({ script: null });
    setLoading(false);
    setProgress(0);
    setProgressMessage('');
    setError(null);
    setOriginalText('');
    setCorrectedText('');
    setHighlightedHtml('');
    setFeedbackText('');
    setHtmlUrl('');
    setTab('original');
    if (scriptInputRef.current) scriptInputRef.current.value = '';
  };

  // === [PROGRESS] 업로드 & 실행: /content/start → /content/progress → /content/result ===
  const handleRun = async () => {
    setError(null);

    if (!fileInfo.script) {
      setError('분석할 텍스트 파일(.txt)을 선택해주세요.');
      return;
    }

    let pollId = null;

    try {
      setLoading(true);
      setProgress(0);
      setProgressMessage('준비 중…');

      // 파일 → 텍스트
      let scriptText = '';
      if (fileInfo.script instanceof File) {
        scriptText = await fileInfo.script.text();  // 파일 → 문자열
      } else if (typeof fileInfo.script === 'string') {
        scriptText = fileInfo.script;
      }

      // 1) 작업 시작 → job_id 수신
      const startRes = await axios.post(`${API_BASE}/content/start`, { script: scriptText });
      const jobId = startRes?.data?.job_id;
      if (!jobId) {
        throw new Error('job_id를 받지 못했습니다.');
      }

      // 2) 진행률 폴링
      await new Promise((resolve, reject) => {
        const startedAt = Date.now();
        pollId = setInterval(async () => {
          try {
            const { data: p } = await axios.get(`${API_BASE}/content/progress/${jobId}`);
            // p: { job_id, progress, status, message }
            if (typeof p?.progress === 'number') setProgress(p.progress);
            if (p?.message) setProgressMessage(p.message);

            if (p?.status === 'error') {
              clearInterval(pollId);
              pollId = null;
              reject(new Error(p?.message || '서버 에러'));
              return;
            }
            if (p?.status === 'done' && (p?.progress ?? 0) >= 100) {
              clearInterval(pollId);
              pollId = null;
              resolve(null);
              return;
            }

            // 안전장치: 10분 초과 시 중단
            if (Date.now() - startedAt > 10 * 60 * 1000) {
              clearInterval(pollId);
              pollId = null;
              reject(new Error('타임아웃(10분)'));
            }
          } catch (e) {
            clearInterval(pollId);
            pollId = null;
            reject(e);
          }
        }, 500); // 0.5초 폴링
      });

      // 3) 최종 결과 조회
      const { data } = await axios.get(`${API_BASE}/content/result/${jobId}`);

      setHtmlUrl(resolveUrl(data?.html_url || ''));
      setOriginalText(data?.original_text || '');
      setCorrectedText(data?.corrected_text || '');

      if (data?.highlighted_html) {
        setHighlightedHtml(data.highlighted_html);
      } else if (data?.original_text && data?.corrected_text) {
        setHighlightedHtml(naiveHighlight(data.original_text, data.corrected_text));
      } else {
        setHighlightedHtml('');
      }

      setFeedbackText(data?.feedback_text || '');
      setProgress(100);
      setProgressMessage('완료');
    } catch (err) {
      console.error(err);
      if (err?.response) {
        setError(`서버 오류(${err.response.status}): ${err.response.data?.detail || '자세한 로그를 확인하세요.'}`);
      } else {
        setError(err?.message || '네트워크/CORS 문제일 수 있어요. FastAPI CORS를 확인해주세요.');
      }
    } finally {
      if (pollId) {
        clearInterval(pollId);
        pollId = null;
      }
      setLoading(false);
    }
  };

  // 교정문 복사
  const copyCorrected = async () => {
    try {
      await navigator.clipboard.writeText(correctedText || '');
      alert('교정된 텍스트를 복사했어요!');
    } catch {
      alert('복사에 실패했어요. 브라우저 권한을 확인해주세요.');
    }
  };

  return (
    <div className="mx-auto w-full p-8 space-y-10 max-w-[1400px]">
      {/* ================= 업로드 박스 ================= */}
      <div className="max-w-xl mx-auto p-8 border border-gray-200 bg-[#f7f9fc] rounded-lg text-center">
        <FileText className="mx-auto mb-4 w-12 h-12 text-gray-400" />
        <h3 className="text-lg font-medium mb-2">대본 파일 업로드</h3>
        <p className="text-sm text-gray-500 mb-4">.txt 파일 업로드 가능</p>

        {/* 숨김 input */}
        <input
          type="file"
          accept=".txt"
          ref={scriptInputRef}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) setFileInfo((prev) => ({ ...prev, script: file }));
          }}
        />

        {/* 버튼 (라운드형, 흰색, 보더) */}
        <div className="flex justify-center gap-4">
          <button
            onClick={() => scriptInputRef.current?.click()}
            className="px-6 py-3 bg-white rounded-full border border-gray-300 hover:bg-gray-100 transition"
          >
            대본 파일 선택
          </button>
        </div>

        {/* 파일명 표시 */}
        {fileInfo.script && (
          <p className="text-sm text-gray-600 mt-4">
            📝 {fileInfo.script.name}
          </p>
        )}

        {/* 실행/초기화 버튼 + 진행도/에러 */}
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={handleRun}
            disabled={loading}
            className="px-4 py-2 rounded-md text-white"
            style={{ backgroundColor: COLOR_SECONDARY, opacity: loading ? 0.7 : 1 }}
            title="분석 시작"
          >
            {loading ? '분석 중…' : '분석 시작'}
          </button>
          <button
            onClick={resetAll}
            disabled={loading}
            className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
            title="초기화"
          >
            초기화
          </button>
        </div>

        {/* [PROGRESS] 서버 진행률 바 */}
        {(loading || progress > 0) && (
          <div className="mt-4">
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className="h-2 rounded-full"
                style={{
                  width: `${progress}%`,
                  backgroundColor: COLOR_SECONDARY,
                  transition: 'width 0.2s ease'
                }}
              />
            </div>
            <p className="mt-2 text-xs text-gray-500">
              {progressMessage || '분석 중…'} {progress}%
            </p>
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>

      {/* ================= 결과 ================= */}
      {(originalText || correctedText || htmlUrl) && (
        <div className="space-y-10">
          {/* 요약 통계 */}
          <section className="grid md:grid-cols-3 gap-4">
            <div className="p-5 rounded-lg border bg-white">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-gray-500" />
                <h4 className="font-semibold">단어 수(교정문)</h4>
              </div>
              <p className="mt-2 text-2xl font-bold">{stats.wordCount}</p>
            </div>
            <div className="p-5 rounded-lg border bg-white">
              <div className="flex items-center gap-2">
                <Hash className="w-5 h-5 text-gray-500" />
                <h4 className="font-semibold">수정된 토큰 수(근사)</h4>
              </div>
              <p className="mt-2 text-2xl font-bold">{stats.errorCount}</p>
            </div>
            <div className="p-5 rounded-lg border bg-white">
              <div className="flex items-center gap-2">
                <ListChecks className="w-5 h-5 text-gray-500" />
                <h4 className="font-semibold">문장당 평균 오류(근사)</h4>
              </div>
              <p className="mt-2 text-2xl font-bold">{stats.avgErrors}</p>
            </div>
          </section>

          {/* 탭: 원문/교정문 */}
          {(originalText || correctedText) && (
            <section className="rounded-lg border bg-white">
              <div className="flex border-b">
                <button
                  className={`px-4 py-2 text-sm ${tab === 'original' ? 'border-b-2 border-black font-semibold' : 'text-gray-500'}`}
                  onClick={() => setTab('original')}
                >
                  원문
                </button>
                <button
                  className={`px-4 py-2 text-sm ${tab === 'corrected' ? 'border-b-2 border-black font-semibold' : 'text-gray-500'}`}
                  onClick={() => setTab('corrected')}
                >
                  교정문
                </button>

                {/* 교정문 복사 */}
                <div className="ml-auto p-2">
                  <button
                    onClick={copyCorrected}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-white"
                    style={{ backgroundColor: COLOR_PRIMARY }}
                    title="교정된 텍스트 복사하기"
                  >
                    <ClipboardCopy className="w-4 h-4" />
                    교정된 텍스트 복사하기
                  </button>
                </div>
              </div>

              {/* ⬇️ 폰트 통일 포인트: pre → div, font-sans 추가 */}
              <div className="p-5">
                {tab === 'original' ? (
                  <div className="whitespace-pre-wrap break-words text-sm leading-6 font-sans">
                    {originalText}
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap break-words text-sm leading-6 font-sans">
                    {correctedText}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* 강조/하이라이트 미리보기 */}
          {highlightedHtml && (
            <section className="rounded-lg border bg-white">
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-2">
                  <Wand2 className="w-5 h-5 text-gray-500" />
                  <h4 className="font-semibold">교정 강조 표시</h4>
                </div>
              </div>
              <div className="px-4 pb-6 text-sm leading-6 font-sans">
                <div dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
              </div>
            </section>
          )}

          {/* 레이더(임시 시각화) */}
          <section className="rounded-lg border bg-white">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-2">
                <h4 className="font-semibold">발표 패턴 분석(임시 지표)</h4>
              </div>
            </div>
            <div className="px-4 pb-6">
              <div className="w-full h-72">
                <ResponsiveContainer>
                  <RadarChart data={radarData}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="subject" />
                    <PolarRadiusAxis angle={30} domain={[0, 10]} />
                    <Radar
                      name="점수"
                      dataKey="A"
                      stroke={COLOR_SECONDARY}
                      fill={COLOR_SECONDARY}
                      fillOpacity={0.45}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          {/* 내용 피드백 텍스트 */}
          {feedbackText && (
            <section className="rounded-lg border bg-white">
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-2">
                  <Wand2 className="w-5 h-5 text-gray-500" />
                  <h4 className="font-semibold">AI 내용 피드백</h4>
                </div>
              </div>
              <div className="px-4 pb-6">
                <div className="p-4 rounded-md border bg-white text-sm whitespace-pre-wrap leading-6 font-sans">
                  {feedbackText}
                </div>
              </div>
            </section>
          )}

          {/* 하단 액션 */}
          <div className="flex flex-wrap items-center gap-3">
            {htmlUrl && (
              <a
                href={htmlUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-white"
                style={{ backgroundColor: COLOR_SECONDARY }}
                title="HTML 전체 보기"
              >
                <ExternalLink className="w-4 h-4" />
                결과 HTML 열기
              </a>
            )}
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="px-3 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
              title="다시 분석하기"
            >
              다시 분석하기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
