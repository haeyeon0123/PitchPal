/* 내용 분석 페이지: 기능 및 디자인 */

import React, { useState, useRef } from 'react';
import axios from 'axios';
import './Analysis_Content.css';
import { CloudUpload, FileText, Hash, ListChecks } from 'lucide-react';

export default function AnalysisContent() {
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState(null);
  const [errors, setErrors] = useState([]);
  const [originalText, setOriginalText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fileInputRef = useRef(null);

  const fetchContentAnalysis = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await axios.post('http://localhost:8000/analyze-content', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  };

  const handleFileSelect = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setProgress(0);
    setStats(null);
    setErrors([]);
    setOriginalText('');
    setError(null);
    setLoading(true);

    let current = 0;
    const interval = setInterval(() => {
      current += 10;
      setProgress(current);
      if (current >= 100) clearInterval(interval);
    }, 120);

    try {
      const result = await fetchContentAnalysis(selectedFile);
      setStats(result.stats);
      setErrors(result.errors);
      setOriginalText(result.originalText);
    } catch (err) {
      setError('분석 실패: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleApplyAll = () => {
    console.log('모두 수정 적용');
  };

  return (
    <div>
      <div className="container mx-auto p-8 space-y-12">
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

        {file && progress < 100 && (
          <div className="max-w-xl mx-auto">
            <progress value={progress} max="100" className="custom-progress w-full h-2 mb-2" />
            <p className="text-sm text-gray-600">맞춤법 검사 중… {progress}%</p>
          </div>
        )}

        {error && (
          <div className="text-center text-red-500">
            <p>{error}</p>
          </div>
        )}

        {progress === 100 && stats && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <SummaryCard icon={<FileText />} value={stats.wordCount} label="총 단어 수" />
            <SummaryCard icon={<Hash />} value={stats.errorCount} label="오류 건수" />
            <SummaryCard icon={<ListChecks />} value={`${stats.avgErrors} /문장`} label="평균 오류" />
          </div>
        )}

        {progress === 100 && (
          <div className="flex flex-col lg:flex-row gap-8">
            <div className="flex-2 p-4 bg-white border border-gray-100 rounded-lg overflow-auto" style={{ maxHeight: '400px' }}>
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
            <div className="flex-1 p-4 bg-white border border-gray-100 rounded-lg overflow-auto" style={{ maxHeight: '400px' }}>
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

function SummaryCard({ icon, value, label }) {
  return (
    <div className="p-6 border rounded-lg bg-white text-center">
      <div className="mx-auto mb-2 w-8 h-8 text-[#5686C4]">{icon}</div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-gray-500">{label}</p>
    </div>
  );
}
