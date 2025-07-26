import React, { useState, useRef } from 'react';
import {
  CheckCircle, Volume2, Activity,
  PauseCircle, Slash
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

const dummyResult = {
  pronunciation_accuracy: 0.84,
  pitch_mean: 98.3,
  pitch_std: 15.2,
  mfcc_mean: [12.3, 18.2, 20.1, 19.0],
  mfcc_std: [2.5, 2.8, 3.1, 2.7],
  wpm: 134.5,
  pause_ratio: 0.13,
  filler_count: 3,
  feedback: "전반적으로 자연스럽고 명확한 발음이었습니다. 약간의 억양 변화만 보완하면 좋습니다!",
  stt_html_url: "model/speech/results/stt_results.html"
};

export default function AnalysisVoice() {
  const [audioFile, setAudioFile] = useState(null);
  const [scriptFile, setScriptFile] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const audioInputRef = useRef(null);
  const scriptInputRef = useRef(null);
  const audioRef = useRef(null);

  const handleUpload = async () => {
    if (!audioFile || !scriptFile) {
      setError("음성 파일과 대본 파일을 모두 업로드해주세요.");
      return;
    }

    setError(null);
    setLoading(true);
    setResult(null);

    setTimeout(() => {
      setResult(dummyResult);
      setLoading(false);
    }, 1000);
  };

  const handleReplay = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play();
    }
  };

  const handleReload = () => window.location.reload();

  const mfccChartData = result?.mfcc_mean?.map((val, i) => ({
    index: `MFCC ${i + 1}`,
    평균: val,
    표준편차: result.mfcc_std[i]
  })) || [];

  const pitchChartData = [{
    항목: 'Pitch',
    평균: result?.pitch_mean,
    표준편차: result?.pitch_std
  }];

  return (
    <div className="container mx-auto p-8 space-y-12">
      {/* 📁 업로드 박스 */}
      <div className="max-w-xl mx-auto bg-[#f7f9fc] border border-gray-200 rounded-xl p-8 text-center space-y-4">
        <h3 className="text-lg font-semibold text-gray-800">파일 업로드</h3>
        <p className="text-sm text-gray-500">.mp3, .wav, .txt 파일 업로드 가능</p>

        {/* 🎤 + 📄 파일 선택 버튼: 나란히 정렬 */}
        <div className="flex justify-center space-x-4">
          <div>
            <input type="file" ref={audioInputRef} accept="audio/*" className="hidden"
              onChange={e => {
                const file = e.target.files[0];
                if (file) {
                  setAudioFile(file);
                  setAudioUrl(URL.createObjectURL(file));
                }
              }}
            />
            <button onClick={() => audioInputRef.current?.click()} className="px-6 py-2 bg-white border border-gray-300 rounded-full hover:bg-gray-100 transition">
              음성 파일 선택
            </button>
          </div>

          <div>
            <input type="file" ref={scriptInputRef} accept=".txt" className="hidden"
              onChange={e => {
                const file = e.target.files[0];
                if (file) setScriptFile(file);
              }}
            />
            <button onClick={() => scriptInputRef.current?.click()} className="px-6 py-2 bg-white border border-gray-300 rounded-full hover:bg-gray-100 transition">
              대본 파일 선택
            </button>
          </div>
        </div>

        {/* 선택한 파일 이름 */}
        {audioFile && scriptFile && (
          <p className="text-sm text-gray-500 mt-2">
            🎧 {audioFile.name} + 📝 {scriptFile.name}
          </p>
        )}

        {/* ✅ 분석 시작 버튼 */}
        <div className="mt-4">
          <button
            onClick={handleUpload}
            className="px-6 py-3 bg-[#6EAED5] text-white rounded-full hover:bg-[#5a9bc8] transition font-semibold"
          >
            분석 시작
          </button>
        </div>
      </div>

      {/* 🔄 분석 중 표시 */}
      {loading && (
        <div className="text-center text-sm text-gray-600">
          분석 중...
        </div>
      )}

      {/* ❌ 에러 표시 */}
      {error && (
        <div className="text-center text-red-500">
          {error}
        </div>
      )}

      {/* ✅ 분석 결과 */}
      {result && (
        <div className="space-y-10">
          {/* 🎧 오디오 플레이어 */}
          {audioUrl && (
            <div className="flex items-center space-x-4 max-w-xl mx-auto">
              <audio ref={audioRef} src={audioUrl} controls className="w-full" />
            </div>
          )}

          {/* 📊 분석 결과 카드 (4개만) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <ResultCard icon={<CheckCircle />} label="발음 유사도" value={`${(result.pronunciation_accuracy * 100).toFixed(1)}%`} />
            <ResultCard icon={<PauseCircle />} label="무음 비율" value={`${(result.pause_ratio * 100).toFixed(1)}%`} />
            <ResultCard icon={<Slash />} label="간투사 수" value={`${result.filler_count}회`} />
            <ResultCard icon={<Volume2 />} label="WPM" value={`${result.wpm?.toFixed(1)}`} />
          </div>

          {/* 📈 MFCC & Pitch 비교 그래프 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* MFCC */}
            <div className="p-4 bg-white border rounded-lg">
              <h4 className="text-md font-semibold text-[#826BC4] mb-2 text-center">MFCC 평균 vs 표준편차</h4>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={mfccChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="index" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="평균" fill="#6EAED5" />
                  <Bar dataKey="표준편차" fill="#C6DDF2" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Pitch */}
            <div className="p-4 bg-white border rounded-lg">
              <h4 className="text-md font-semibold text-[#826BC4] mb-2 text-center">Pitch 평균 vs 표준편차</h4>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={pitchChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="항목" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="평균" fill="#6EAED5" />
                  <Bar dataKey="표준편차" fill="#C6DDF2" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 💬 종합 피드백 */}
          <div className="bg-[#fdfdfd] border border-gray-200 rounded-lg p-6">
            <h4 className="text-md font-bold text-[#826BC4] mb-2">📝 종합 피드백</h4>
            <p className="text-gray-800">{result.feedback}</p>
          </div>

          {/* 🔳 버튼 3개: 음성 재생 / 발음 분석 결과 / 다시 분석 */}
          <div className="flex justify-end space-x-4 mt-8">
            <button
              onClick={handleReplay}
              className="px-6 py-3 bg-[#3EB489] text-white rounded-lg hover:bg-[#2fa077] transition"
            >
              음성 재생
            </button>
            <a
              href={result.stt_html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3 bg-[#6B8DD6] text-white rounded-lg hover:bg-[#5574bb] transition"
            >
              발음 분석 결과
            </a>
            <button
              onClick={handleReload}
              className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-100 transition"
            >
              다시 분석하기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ResultCard({ icon, label, value }) {
  return (
    <div className="p-4 bg-white rounded-lg shadow text-center">
      <div className="mb-1 text-[#5686C4] mx-auto w-6 h-6">{icon}</div>
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
}
