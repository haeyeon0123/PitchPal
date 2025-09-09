// 내용 분석 페이지 (백엔드 연동 + 레이더차트 점수 연동 안정판)

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
const API_BASE = (() => {
  const vite = (typeof import.meta !== 'undefined'
    && import.meta.env
    && import.meta.env.VITE_API_BASE
    && String(import.meta.env.VITE_API_BASE).replace(/\/+$/, ''));
  if (vite) return vite;

  const cra = (typeof process !== 'undefined'
    && process.env
    && process.env.REACT_APP_API_BASE
    && String(process.env.REACT_APP_API_BASE).replace(/\/+$/, ''));
  if (cra) return cra;

  return 'http://localhost:8000';
})();

// 상대경로 html_url을 절대경로로 보정 (선택)
function resolveUrl(u) {
  if (!u) return '';
  if (u.startsWith('http://') || u.startsWith('https://')) return u;
  return `${API_BASE}${u.startsWith('/') ? u : '/' + u}`;
}

// 프론트 UI 색상
const COLOR_PRIMARY = '#6EAED5';   // 교정문 복사 버튼
const COLOR_SECONDARY = '#A68ED5'; // 분석 시작/링크 버튼

// ===================== 보조 유틸 =====================
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
        return '<span style="color:red;font-weight:bold;">' + w + '</span>';
      })
      .join(' ');
  } catch {
    return corrected;
  }
}

function countHighlightedSpans(html = '') {
  return (html.match(/<span[^>]*style=["'][^"']*color:\s*red/gi) || []).length;
}

// ===================== 컴포넌트 =====================
export default function Analysis_Content() {
  // 업로드
  const scriptInputRef = useRef(null);
  const [fileInfo, setFileInfo] = useState({ script: null });

  // 요청/응답 상태
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [error, setError] = useState(null);

  // 결과
  const [originalText, setOriginalText] = useState('');
  const [correctedText, setCorrectedText] = useState('');
  const [highlightedHtml, setHighlightedHtml] = useState('');
  const [feedbackText, setFeedbackText] = useState('');
  const [htmlUrl, setHtmlUrl] = useState('');

  // ✅ 백엔드 점수(한글 키)
  const [scores, setScores] = useState(null);

  // 탭
  const [tab, setTab] = useState('original'); // 'original' | 'corrected'

  // 간단 통계
  const stats = useMemo(() => {
    const wc = correctedText ? correctedText.trim().split(/\s+/).filter(Boolean).length : 0;
    const errorCount = countHighlightedSpans(highlightedHtml);
    const avgErrors = wc > 0 ? errorCount / Math.max(1, Math.round(wc / 20)) : 0;
    return { wordCount: wc, errorCount, avgErrors: Number(avgErrors.toFixed(2)) };
  }, [correctedText, highlightedHtml]);

  // ✅ 레이더 데이터 (scores 있으면 실점수, 없으면 임시값)
  const radarData = useMemo(() => {
    const clamp10 = (n) => Math.max(0, Math.min(10, Number(n) || 0));
    const ORDER = ['논리성', '구조화', '간결성', '전달력', '일관성'];
    const hasScores = scores && typeof scores === 'object' && Object.keys(scores).length > 0;

    if (hasScores) {
      return ORDER.map((k) => ({
        subject: k,
        A: clamp10(scores[k]),
        fullMark: 10,
      }));
    }

    // (폴백) 임시 계산치
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
  }, [scores, highlightedHtml]);

  // 언마운트 시 폴링 정리 (보조)
  useEffect(() => {
    return () => {
      // setInterval 정리(안전장치) — handleRun 안에서도 정리함
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
    setScores(null);
    setTab('original');
    if (scriptInputRef.current) scriptInputRef.current.value = '';
  };

  // === 실행: /content/start → /content/progress → /content/result ===
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

      // 파일 → 문자열
      let scriptText = '';
      if (fileInfo.script instanceof File) {
        scriptText = await fileInfo.script.text();
      } else if (typeof fileInfo.script === 'string') {
        scriptText = fileInfo.script;
      }

      // 1) 작업 시작
  const startRes = await axios.post(
    `${API_BASE}/content/start`,
    { script: scriptText },
    { headers: { 'Content-Type': 'application/json' } }
  );
  const jobId = String(startRes?.data?.job_id ?? '').trim();
  if (!jobId) throw new Error('job_id를 받지 못했습니다.');
  // 디버그가 필요하면 주석 해제
  // console.log('[content] jobId =', jobId);

      // 2) 진행률 폴링
  await new Promise((resolve, reject) => {
    const startedAt = Date.now();
    let attempts404 = 0;

    // 첫 폴링 전 아주 짧게 대기 (서버 딕셔너리 반영 지연 대비)
    const firstDelay = setTimeout(() => {
      pollId = setInterval(async () => {
        try {
          const resp = await axios.get(
            `${API_BASE}/content/progress/${encodeURIComponent(jobId)}`
          );
          const p = resp.data || {};
          if (typeof p.progress === 'number') setProgress(p.progress);
          if (p.message) setProgressMessage(p.message);

          if (p.status === 'error') {
            clearInterval(pollId); pollId = null;
            return reject(new Error(p.message || '서버 에러'));
          }
          if (p.status === 'done' && (p.progress ?? 0) >= 100) {
            clearInterval(pollId); pollId = null;
            return resolve(null);
          }

          // 10분 초과 안전장치
          if (Date.now() - startedAt > 10 * 60 * 1000) {
            clearInterval(pollId); pollId = null;
            return reject(new Error('타임아웃(10분)'));
          }
        } catch (err) {
          // 초반 404는 짧게 재시도 (레이스 컨디션)
          const status = err?.response?.status;
          if (status === 404 && attempts404 < 8) {
            attempts404++;
            // 약한 backoff: 300ms 대기 후 다음 틱에서 재시도
            return;
          }
          clearInterval(pollId); pollId = null;
          return reject(err);
        }
      }, 500);
    }, 250);

    // 타임아웃 방지: startDelay도 정리
    const clearAll = () => {
      try { clearTimeout(firstDelay); } catch {}
      try { if (pollId) clearInterval(pollId); } catch {}
      pollId = null;
    };
  });

      // 3) 결과 조회
      const { data } = await axios.get(`${API_BASE}/content/result/${jobId}`);

      setHtmlUrl(resolveUrl(data && data.html_url ? data.html_url : ''));
      setOriginalText((data && data.original_text) || '');
      setCorrectedText((data && data.corrected_text) || '');

      if (data && data.highlighted_html) {
        setHighlightedHtml(data.highlighted_html);
      } else if (data && data.original_text && data.corrected_text) {
        setHighlightedHtml(naiveHighlight(data.original_text, data.corrected_text));
      } else {
        setHighlightedHtml('');
      }

      // ✅ AI 분석 피드백 정규화(기능코드 수정 없이도 동작)
      const fb =
        // 표준 우선
        (data && data.feedback_text) ??
        // 기능코드가 content_feedback.feedback에 넣는 경우
        (data && data.content_feedback && data.content_feedback.feedback) ??
        // 그냥 feedback 키로 오는 경우 (string 또는 string[])
        (Array.isArray(data?.feedback) ? data.feedback.join('\n') : data?.feedback) ??
        '';
      setFeedbackText(String(fb).trim());

      // ✅ 점수 반영 (빈 객체면 null 처리)
      const s = data && data.scores;
      setScores(s && typeof s === 'object' && Object.keys(s).length > 0 ? s : null);

      setProgress(100);
      setProgressMessage('완료');
    } catch (err) {
      console.error(err);
      if (err && err.response) {
        setError(`서버 오류(${err.response.status}): ${err.response.data && err.response.data.detail ? err.response.data.detail : '자세한 로그를 확인하세요.'}`);
      } else {
        setError((err && err.message) || '네트워크/CORS 문제일 수 있어요. FastAPI CORS를 확인해주세요.');
      }
    } finally {
      if (pollId) { clearInterval(pollId); pollId = null; }
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

  const hasScores = scores && typeof scores === 'object' && Object.keys(scores).length > 0;

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
            const file = e.target.files && e.target.files[0];
            if (file) setFileInfo((prev) => ({ ...prev, script: file }));
          }}
        />

        {/* 버튼 */}
        <div className="flex justify-center gap-4">
          <button
            onClick={() => {
              if (scriptInputRef.current) scriptInputRef.current.click();
            }}
            className="px-6 py-3 bg-white rounded-full border border-gray-300 hover:bg-gray-100 transition"
          >
            대본 파일 선택
          </button>
        </div>

        {/* 파일명 표시 */}
        {fileInfo.script && (
          <p className="text-sm text-gray-600 mt-4">
            📝 {fileInfo.script.name || '텍스트 입력'}
          </p>
        )}

        {/* 실행/초기화 + 진행/에러 */}
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

          {/* ✅ 레이더(실데이터 우선, 없으면 임시) */}
          <section className="rounded-lg border bg-white">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-2">
                <h4 className="font-semibold">
                  {hasScores ? '항목별 종합 점수 (0~10)' : '발표 패턴 분석(임시 지표)'}
                </h4>
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

          {/* ✅ AI 분석 피드백 (항상 표시) */}
          <section className="rounded-lg border bg-white">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-2">
                <Wand2 className="w-5 h-5 text-gray-500" />
                <h4 className="font-semibold">AI 내용 피드백</h4>
              </div>
            </div>
            <div className="px-4 pb-6">
              {feedbackText ? (
                <ul className="p-4 rounded-md border bg-white text-sm leading-6 font-sans space-y-2">
                  {String(feedbackText)
                    .split(/\r?\n/)
                    .filter(Boolean)
                    .map((line, i) => {
                      // 🔧 앞뒤 따옴표·인코딩(&apos;, &#39;) 제거
                      const cleanLine = line
                        .replace(/^\s*-\s*/, '')
                        .replace(/^['"`“”‘’‛❛❜＇]+/, '')   // 앞쪽 따옴표류 제거
                        .replace(/['"`“”‘’‛❛❜＇]+$/, '')   // 뒤쪽 따옴표류 제거
                        .replace(/^(&apos;|&#39;)+/, '')   // HTML 엔티티 제거 (앞)
                        .replace(/(&apos;|&#39;)+$/, '');  // HTML 엔티티 제거 (뒤)

                      return (
                        <li key={i} className="flex items-start gap-2">
                          <span className="mt-[6px] w-1.5 h-1.5 rounded-full bg-gray-400 inline-block" />
                          <span>{cleanLine}</span>
                        </li>
                      );
                    })}
                </ul>
              ) : (
                <div className="p-4 rounded-md border bg-white text-sm text-gray-500">
                  표시할 피드백이 없습니다.
                </div>
              )}
            </div>
          </section>

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
