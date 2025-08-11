// ✅ 내용 분석 페이지 (더미데이터 Ver.)
// 아직 최신 버전 아님

import React, { useState, useRef } from 'react';
import axios from 'axios'; // ⚠️ 현재 axios는 사용되지 않지만 실제 백엔드 연동 시 필요
import {
  CloudUpload, ChevronDown, ChevronUp,
  Brain, Repeat, Layout, AlertTriangle, Trash,
  ExternalLink, FileText, Hash, ListChecks
} from 'lucide-react'; // 아이콘
import './Analysis_Content.css'; // 커스텀 스타일

// ✅ 더미 데이터: 실제 결과 대신 UI 확인용 mock 데이터
const mockResult = {
  stats: { wordCount: 265, errorCount: 7, avgErrors: 0.6 },
  errors: [
    { original: '잇엇다', suggestion: '있었다', type: '맞춤법' },
    { original: '되였다', suggestion: '되었다', type: '표기법' },
    { original: '불필요하다 생각한다', suggestion: '불필요하다고 생각한다', type: '문법' },
  ],
  originalText: '이 발표는 매우 중요하다고 생각한다. 그러나 잇엇다 되였다 불필요하다 생각한다.',
  correctedText: '이 발표는 매우 중요하다고 생각한다. 그러나 있었다 되었다 불필요하다고 생각한다.',
  highlightedText:
    '이 발표는 매우 중요하다고 생각한다. 그러나 <span style="color:red;">있었다</span> <span style="color:red;">되었다</span> <span style="color:red;">불필요하다고</span> 생각한다.',
  feedback: {
    '일관성': '전체적으로 주제에 대한 집중도가 높고 일관된 내용 흐름을 유지하고 있습니다.',
    '논리성': '초반 주장과 후반 설명 사이에 근거 연결이 약간 부족합니다.',
    '구성': '도입-전개-결론이 대체로 잘 나뉘어 있으나 결론 부분이 약합니다.',
    '주제 일탈': '전체 주제를 벗어나는 문장은 발견되지 않았습니다.',
    '불필요한 내용': '"되었다" 부분은 반복된 표현으로 제거해도 무방합니다.'
  },
  htmlLink: '/model/content/results/corrected_result.html'
};

export default function AnalysisContent() {
  // ⬇️ 업로드 및 분석 상태 관리용 state들
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState(null); // 단어 수, 오류 수 등
  const [errors, setErrors] = useState([]); // 교정된 오류 목록
  const [originalText, setOriginalText] = useState('');
  const [correctedText, setCorrectedText] = useState('');
  const [highlightedText, setHighlightedText] = useState('');
  const [feedback, setFeedback] = useState({}); // 내용 분석 피드백
  const [htmlLink, setHtmlLink] = useState(''); // 외부 링크
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // ⬇️ 탭 및 피드백 아코디언 상태 관리
  const [activeTab, setActiveTab] = useState('highlighted');
  const [openFeedback, setOpenFeedback] = useState({});
  const fileInputRef = useRef(null); // 숨겨진 파일 input 조작용

  // ✅ 상태 초기화 함수 (새 파일 업로드 시 호출됨)
  const resetStates = () => {
    setStats(null);
    setErrors([]);
    setOriginalText('');
    setCorrectedText('');
    setHighlightedText('');
    setFeedback({});
    setHtmlLink('');
    setError(null);
    setProgress(0);
  };

  // ✅ mock 결과를 state에 적용하는 함수
  const parseResult = (res) => {
    setStats(res.stats);
    setErrors(res.errors);
    setOriginalText(res.originalText);
    setCorrectedText(res.correctedText);
    setHighlightedText(res.highlightedText);
    setFeedback(res.feedback);
    setHtmlLink(res.htmlLink);
    // 아코디언 모두 open 상태로 초기화
    setOpenFeedback(Object.fromEntries(Object.keys(res.feedback).map(k => [k, true])));
  };

  // ✅ 파일 선택 시 동작하는 함수
  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;
    setFile(selectedFile);
    setFileName(selectedFile.name);
    resetStates();
    simulateUpload(); // 더미 업로드 시뮬레이션
  };

  // ✅ 분석 시뮬레이션 (실제 백엔드 연동 전용)
  const simulateUpload = () => {
    setLoading(true);
    let current = 0;
    const interval = setInterval(() => {
      current += 10;
      setProgress(current);
      if (current >= 100) clearInterval(interval);
    }, 120);

    setTimeout(() => {
      parseResult(mockResult); // 실제로는 axios 요청 결과를 넣어야 함
      setLoading(false);
    }, 1500);
  };

  // ✅ 교정된 텍스트 클립보드 복사
  const handleApplyAll = () => {
    navigator.clipboard.writeText(correctedText);
    alert('교정된 텍스트가 클립보드에 복사되었습니다.');
  };

  // ✅ 피드백 유형별 아이콘 매핑
  const iconMap = {
    '일관성': <Repeat className="w-5 h-5 text-blue-500" />,
    '논리성': <Brain className="w-5 h-5 text-indigo-500" />,
    '구성': <Layout className="w-5 h-5 text-green-500" />,
    '주제 일탈': <AlertTriangle className="w-5 h-5 text-yellow-500" />,
    '불필요한 내용': <Trash className="w-5 h-5 text-red-500" />,
  };

  // ✅ 실제 렌더링 영역 시작
  return (
    <div className="container mx-auto p-8 space-y-20">

      {/* 🔹 파일 업로드 박스 */}
      <div className="max-w-xl mx-auto p-8 border border-gray-200 bg-[#f7f9fc] rounded-lg text-center">
        <CloudUpload className="mx-auto mb-4 w-12 h-12 text-gray-400" />
        <h3 className="text-lg font-medium mb-2">파일 업로드</h3>
        <p className="text-sm text-gray-500 mb-4">.docx, .txt, .pdf 지원</p>
        <input
          type="file"
          ref={fileInputRef}
          accept=".docx,.txt,.pdf"
          className="hidden"
          onChange={handleFileSelect}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-6 py-3 bg-white rounded-full border border-gray-300 hover:bg-gray-100 transition"
        >
          대본 파일 선택
        </button>
        {fileName && <p className="text-sm text-gray-600 mt-2">📄 {fileName}</p>}
      </div>

      {/* 🔹 업로드 후 분석 진행 중 표시 */}
      {file && progress < 100 && (
        <div className="max-w-xl mx-auto text-center">
          <progress value={progress} max="100" className="custom-progress w-full h-2 mb-2" />
          <p className="text-sm text-gray-600">분석 중…</p>
        </div>
      )}

      {/* 🔹 에러 메시지 */}
      {error && <div className="text-center text-red-500">{error}</div>}

      {/* 🔹 맞춤법 교정 결과 요약 및 표 */}
      {progress === 100 && stats && (
        <section className="space-y-10">
          <h2 className="text-2xl font-bold text-[#3A5E88] border-b pb-2">📝 맞춤법 교정 피드백</h2>

          {/* 요약 카드 3개 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            <SummaryCard icon={<FileText />} value={stats.wordCount} label="총 단어 수" />
            <SummaryCard icon={<Hash />} value={stats.errorCount} label="오류 건수" />
            <SummaryCard icon={<ListChecks />} value={`${stats.avgErrors} /문장`} label="평균 오류" />
          </div>

          {/* 텍스트 보기 탭 */}
          <div className="mt-6">
            <div className="flex flex-wrap gap-2 sm:space-x-4 mb-2">
              <TabButton label="교정 강조" tab="highlighted" activeTab={activeTab} setActiveTab={setActiveTab} />
              <TabButton label="원본 텍스트" tab="original" activeTab={activeTab} setActiveTab={setActiveTab} />
              <TabButton label="교정된 텍스트" tab="corrected" activeTab={activeTab} setActiveTab={setActiveTab} />
            </div>
            <div className="p-4 bg-white border rounded-lg text-gray-800 whitespace-pre-wrap leading-relaxed">
              {activeTab === 'highlighted' && <div dangerouslySetInnerHTML={{ __html: highlightedText }} />}
              {activeTab === 'original' && originalText}
              {activeTab === 'corrected' && correctedText}
            </div>
          </div>

          {/* 오류 상세 표 */}
          {errors.length > 0 && (
            <div className="p-4 bg-white border border-gray-100 rounded-lg overflow-auto min-w-[600px]">
              <table className="w-full text-left">
                <thead>
                  <tr>
                    <th className="py-2">오류 문장</th>
                    <th className="py-2">수정안</th>
                    <th className="py-2">유형</th>
                  </tr>
                </thead>
                <tbody>
                  {errors.map((err, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="py-2 pr-4">{err.original}</td>
                      <td className="py-2 pr-4">{err.suggestion}</td>
                      <td className="py-2">{err.type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* 🔹 내용 분석 피드백 아코디언 카드 */}
      {progress === 100 && Object.keys(feedback).length > 0 && (
        <section className="space-y-10">
          <h2 className="text-2xl font-bold text-[#3A5E88] border-b pb-2">🧠 내용 분석 피드백</h2>

          <div className="grid sm:grid-cols-2 gap-4 pt-2">
            {Object.entries(feedback).map(([key, value], idx) => (
              <div key={idx} className="border border-gray-200 rounded-lg shadow-sm transition-all duration-300">
                <button
                  onClick={() => setOpenFeedback(prev => ({ ...prev, [key]: !prev[key] }))}
                  className="flex items-center justify-between w-full px-5 py-4 text-left bg-white rounded-t-lg hover:bg-gray-50"
                >
                  <div className="flex items-center gap-2 text-lg font-semibold text-gray-800">
                    {iconMap[key] || '📝'} <span>{key}</span>
                  </div>
                  <div className={`transition-transform duration-200 ${openFeedback[key] ? 'rotate-180' : ''}`}>
                    {openFeedback[key] ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </div>
                </button>
                {openFeedback[key] && (
                  <div className="px-6 pb-5 pt-1 text-gray-700 text-[15px] leading-relaxed border-t bg-white rounded-b-lg">
                    {value}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* 하단 버튼들 */}
          <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 mt-6">
            {htmlLink && (
              <a
                href={htmlLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center space-x-2 px-6 py-3 bg-[#A68ED5] text-white font-semibold rounded-lg hover:bg-[#9373c4] transition"
              >
                <ExternalLink className="w-4 h-4 text-white" />
                <span>맞춤법 교정 결과 보기</span>
              </a>
            )}
            <button
              onClick={handleApplyAll}
              className="px-6 py-3 bg-[#6EAED5] text-white font-semibold rounded-lg hover:bg-[#5C9EC0] transition"
            >
              교정된 텍스트 복사하기
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 border border-gray-300 font-normal rounded-lg hover:bg-gray-100 transition"
            >
              다시 분석하기
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

// ✅ 요약 카드 (단어 수 / 오류 수 등)
function SummaryCard({ icon, value, label }) {
  return (
    <div className="p-6 border rounded-lg bg-white text-center">
      <div className="mx-auto mb-2 w-8 h-8 text-[#5686C4]">{icon}</div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-gray-500">{label}</p>
    </div>
  );
}

// ✅ 탭 버튼 (텍스트 보기 용)
function TabButton({ label, tab, activeTab, setActiveTab }) {
  return (
    <button
      onClick={() => setActiveTab(tab)}
      className={`px-4 py-2 rounded font-medium transition ${
        activeTab === tab ? 'bg-[#6EAED5] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {label}
    </button>
  );
}
