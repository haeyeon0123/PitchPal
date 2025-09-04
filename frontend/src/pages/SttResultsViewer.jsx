// frontend/src/pages/SttResultsViewer.jsx
import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";

/**
 * STT 결과 HTML을 dev 프록시(3000→8000)로 가져와
 * 따옴표/대괄호/쉼표를 정리해 iframe(srcDoc)으로 표시.
 * - CRA proxy: package.json에 "proxy": "http://localhost:8000"
 * - fetch는 상대경로로 요청 → CORS 신경 X
 * - credentials: 'omit' 유지
 */
export default function SttResultsViewer() {
  const [searchParams] = useSearchParams();
  const [html, setHtml] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const urlParam = searchParams.get("url"); // 예: http://localhost:8000/model/speech/results/xxxx/stt_results.html

  // 8000 절대 URL → 상대경로로 치환하여 프록시 태움
  let fetchPath = urlParam || "";
  if (fetchPath.startsWith("http://localhost:8000")) {
    fetchPath = fetchPath.replace("http://localhost:8000", "");
  } else if (fetchPath.startsWith("https://localhost:8000")) {
    fetchPath = fetchPath.replace("https://localhost:8000", "");
  }

  useEffect(() => {
    if (!fetchPath) {
      setError("표시할 STT 결과 URL이 없습니다. (?url= 누락)");
      return;
    }
    (async () => {
      try {
        // 같은 Origin처럼 동작(프록시) → CORS 무관
        const res = await fetch(fetchPath, { credentials: "omit" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        let text = await res.text();

        // 최소 침습 문자열 정리
        text = text
          .replace(/'([^']+)'/g, "$1") // '토큰' → 토큰
          .replace(/\[\s*/g, "")       // [ 제거
          .replace(/\s*\]/g, "")       // ] 제거
          .replace(/,\s*/g, " ")       // 쉼표 → 공백
          .replace(/\s{2,}/g, " ");    // 과공백 축소

        setHtml(text);
      } catch (e) {
        setError(`결과를 불러오지 못했어요: ${e.message}`);
      }
    })();
  }, [fetchPath]);

  if (error) {
    return (
      <div className="p-6">
        <p className="text-red-600 font-semibold mb-2">오류</p>
        <p className="text-gray-700 mb-4">{error}</p>
        <button
          onClick={() => navigate(-1)}
          className="px-4 py-2 rounded-lg bg-gray-800 text-white"
        >
          뒤로 가기
        </button>
      </div>
    );
  }

  if (!html) return <div className="p-6 text-gray-600">불러오는 중…</div>;

  return (
    <div className="w-full h-[85vh] p-4">
      <div className="mb-3 flex gap-2">
        <button
          onClick={() => navigate(-1)}
          className="px-3 py-2 rounded-lg bg-gray-800 text-white"
        >
          ← 뒤로
        </button>
        {/* 원본도 새 탭으로 열 수 있게(디버깅용) */}
        <a
          href={urlParam || "#"}
          target="_blank"
          rel="noreferrer"
          className="px-3 py-2 rounded-lg bg-blue-600 text-white"
        >
          원본 열기
        </a>
      </div>

      {/* 정리된 HTML을 그대로 렌더 */}
      <iframe
        title="STT Result (cleaned)"
        srcDoc={html}
        className="w-full h-full border rounded-lg"
      />
    </div>
  );
}
