/* 내용 분석 페이지: 기능 및 디자인 */

import React, { useState, useRef } from 'react';
import './Analysis_Content.css';
import { CloudUpload, FileText, Hash, ListChecks } from 'lucide-react';

export default function AnalysisContent() {
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState({ wordCount: 0, errorCount: 0, avgErrors: 0 });
  const [errors, setErrors] = useState([]);
  const [originalText, setOriginalText] = useState('');
  const fileInputRef = useRef(null);

  const handleFileSelect = e => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;
    setFile(selectedFile);
    setProgress(0);
    // TODO: 실제 검사 로직 연동
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) { clearInterval(interval); return 100; }
        return prev + 10;
      });
    }, 200);
    // 예시 데이터 세팅
    setStats({ wordCount: 1234, errorCount: 27, avgErrors: 0.8 });
    setErrors([
      { original: '틀린', suggestion: '틀린(정정)', type: '맞춤법' },
      { original: '예시', suggestion: '예시(수정)', type: '띄어쓰기' }
    ]);
    setOriginalText(
      '여기에 원문 텍스트가 표시됩니다. 오류 위치가 밑줄로 강조됩니다.'
    );
  };

  const handleApplyAll = () => {
    console.log('모두 수정 적용');
  };

  return (
    // 배경색 제거
    <div>
      <div className="container mx-auto p-8 space-y-12">
        {/* 1. 파일 업로드 영역 */}
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
            파일 선택
            </button>
        </div>

        {/* 2. 검사 진행 상태 */}
        {file && (
          <div className="max-w-xl mx-auto">
           <progress
             value={progress}
             max="100"
            className="custom-progress w-full h-2 mb-2"
            />
            <p className="text-sm text-gray-600">맞춤법 검사 중… {progress}%</p>
          </div>
        )}

        {/* 3. 요약 대시보드 */}
        {progress === 100 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="p-6 border rounded-lg bg-white text-center">
              <FileText className="mx-auto mb-2 w-8 h-8 text-[#5686C4]" />
              <p className="text-2xl font-bold">{stats.wordCount}</p>
              <p className="text-gray-500">총 단어 수</p>
            </div>
            <div className="p-6 border rounded-lg bg-white text-center">
              <Hash className="mx-auto mb-2 w-8 h-8 text-[#5686C4]" />
              <p className="text-2xl font-bold">{stats.errorCount}</p>
              <p className="text-gray-500">오류 건수</p>
            </div>
            <div className="p-6 border rounded-lg bg-white text-center">
              <ListChecks className="mx-auto mb-2 w-8 h-8 text-[#5686C4]" />
              <p className="text-2xl font-bold">{stats.avgErrors} /문장</p>
              <p className="text-gray-500">평균 오류</p>
            </div>
          </div>
        )}

        {/* 4. 텍스트 원문 + 하이라이트 */}
        {progress === 100 && (
          <div className="flex flex-col lg:flex-row gap-8">
            <div
              className="flex-2 p-4 bg-white border border-gray-100 rounded-lg overflow-auto"
              style={{ maxHeight: '400px' }}
            >
              <pre className="whitespace-pre-wrap text-gray-800">
                {originalText.split(' ').map((word, idx) => {
                  const err = errors.find(e => word.includes(e.original));
                  return err ? (
                    <span
                      key={idx}
                      className="underline decoration-red-500 decoration-2 cursor-help"
                      title={`${err.original} → ${err.suggestion}`}
                    >
                      {word}{' '}
                    </span>
                  ) : (
                    <span key={idx}>{word} </span>
                  );
                })}
              </pre>
            </div>
            <div
              className="flex-1 p-4 bg-white border border-gray-100 rounded-lg overflow-auto"
              style={{ maxHeight: '400px' }}
            >
              <table className="w-full text-left">
                <thead>
                  <tr>
                    <th className="py-2">오류 문장</th>
                    <th className="py-2">제안 수정안</th>
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
          </div>
        )}

        {/* 5. 수정 적용 & 다시 분석하기 */}
        {progress === 100 && (
          <div className="flex justify-end space-x-4">
            <button
              onClick={handleApplyAll}
              className="px-6 py-3 bg-[#3EB489] text-white font-semibold rounded-lg hover:bg-[#36A778] transition"
            >
              모두 수정 적용
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-100 transition"
            >
              다시 분석하기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}