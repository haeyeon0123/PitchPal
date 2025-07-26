/* 음성 분석 페이지: 기능 및 디자인 */

import React, { useState, useRef } from 'react';
import axios from 'axios';
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer
} from 'recharts';
import {
  CheckCircle, PauseCircle, Slash, Volume2, Activity, Mic, AudioLines
} from 'lucide-react';

export default function AnalysisVoice() {
  // 🔊 상태 관리: 파일, 결과, 로딩, 에러 등
  const [audioFile, setAudioFile] = useState(null);
  const [scriptFile, setScriptFile] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  // 🔧 input ref 및 재생 컨트롤 ref
  const audioInputRef = useRef(null);
  const scriptInputRef = useRef(null);
  const audioRef = useRef(null);

  // 🎯 분석 시작 버튼 클릭 시 실행되는 로직
  const handleUpload = async () => {
    if (!audioFile || !scriptFile) {
      setError("음성 파일과 대본 파일을 모두 업로드해주세요.");
      return;
    }

    setError(null);
    setLoading(true);
    setResult(null);

    try {
      // ✅ 백엔드로 보낼 FormData 구성
      const formData = new FormData();
      formData.append("audio_file", audioFile);
      formData.append("script_file", scriptFile);

      // ✅ FastAPI 백엔드 POST 요청 (연결 주소는 /speech/analyze)
      const response = await axios.post("http://localhost:8000/speech/analyze", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });

      // ✅ 백엔드에서 받아온 분석 결과 저장
      setResult(response.data);
    } catch (err) {
      console.error("❌ 분석 실패:", err);
      setError("분석 중 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  };

  // 🔁 오디오 다시 듣기
  const handleReplay = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play();
    }
  };

  // 🔄 페이지 초기화
  const handleReload = () => window.location.reload();

  // 📊 Radar 차트에 들어갈 점수 데이터 가공
  const radarData = result ? [
    { category: "발음", value: result.scores.pronunciation },
    { category: "억양", value: result.scores.intonation },
    { category: "속도", value: result.scores.speed },
    { category: "간투사", value: result.scores.filler },
    { category: "무음", value: result.scores.pause },
    { category: "안정성", value: result.scores.mfcc }
  ] : [];

  // 💡 개선 팁 (프론트에 고정된 텍스트)
  const improvementTips = [
    { title: "발음 정확도", tip: "모음과 자음을 또렷하게 구분해서 발음해보세요." },
    { title: "발화 속도", tip: "너무 빠르지 않게, 청자가 따라올 수 있는 속도를 유지하세요." },
    { title: "억양 다양성", tip: "중요한 단어나 문장 끝에 억양을 넣어 감정을 표현해보세요." },
    { title: "간투사 사용", tip: "불필요한 '음', '어' 사용을 줄이기 위해 말 전 생각을 정리해보세요." },
    { title: "무음 비율", tip: "긴 침묵보다는 자연스러운 숨 고르기로 연결해보세요." },
    { title: "음색 안정성", tip: "일관된 발성 톤과 안정적인 발음을 유지해보세요." }
  ];

  return (
    <div className="container mx-auto px-4 py-8 space-y-12">
      {/* 🎙️ 업로드 박스 */}
      <div className="max-w-xl mx-auto bg-[#f7f9fc] border border-gray-200 rounded-xl p-6 sm:p-8 text-center space-y-4">
        <Mic className="mx-auto text-[#6EAED5] w-8 h-8" />
        <h3 className="text-lg font-semibold text-gray-800">파일 업로드</h3>
        <p className="text-sm text-gray-500">.mp3, .wav, .txt 파일 업로드 가능</p>

        {/* 파일 선택 버튼들 */}
        <div className="flex flex-col sm:flex-row justify-center items-center sm:space-x-4 space-y-3 sm:space-y-0">
          {/* 🎧 음성 파일 선택 */}
          <button onClick={() => audioInputRef.current?.click()} className="px-6 py-2 bg-white border border-gray-300 rounded-full hover:bg-gray-100 transition">
            음성 파일 선택
          </button>
          <input type="file" ref={audioInputRef} accept="audio/*" className="hidden" onChange={e => {
            const file = e.target.files[0];
            if (file) {
              setAudioFile(file);
              setAudioUrl(URL.createObjectURL(file)); // 🔊 프리뷰용 URL 생성
            }
          }} />

          {/* 📝 대본 파일 선택 */}
          <button onClick={() => scriptInputRef.current?.click()} className="px-6 py-2 bg-white border border-gray-300 rounded-full hover:bg-gray-100 transition">
            대본 파일 선택
          </button>
          <input type="file" ref={scriptInputRef} accept=".txt" className="hidden" onChange={e => {
            const file = e.target.files[0];
            if (file) setScriptFile(file);
          }} />
        </div>

        {/* 업로드된 파일명 미리보기 */}
        {audioFile && scriptFile && (
          <p className="text-sm text-gray-500 mt-2">
            🎧 {audioFile.name} + 📝 {scriptFile.name}
          </p>
        )}

        {/* 🚀 분석 시작 버튼 */}
        <button
          onClick={handleUpload}
          className="mt-4 px-6 py-3 bg-[#6EAED5] text-white rounded-full hover:bg-[#5a9bc8] transition font-semibold"
        >
          분석 시작
        </button>
      </div>

      {/* 📡 로딩 및 에러 표시 */}
      {loading && <div className="text-center text-sm text-gray-600">분석 중...</div>}
      {error && <div className="text-center text-red-500">{error}</div>}

      {/* ✅ 분석 결과 렌더링 */}
      {result && (
        <ResultSection
          result={result}
          audioUrl={audioUrl}
          audioRef={audioRef}
          onReplay={handleReplay}
          onReload={handleReload}
          radarData={radarData}
          improvementTips={improvementTips}
        />
      )}
    </div>
  );
}

// 📦 분석 결과 컴포넌트 분리
function ResultSection({ result, audioUrl, audioRef, onReplay, onReload, radarData, improvementTips }) {
  return (
    <div className="space-y-10">
      {/* 🎧 오디오 플레이어 */}
      {audioUrl && (
        <div className="flex items-center space-x-4 max-w-xl mx-auto">
          <audio ref={audioRef} src={audioUrl} controls className="w-full" />
        </div>
      )}

      {/* 🧾 결과 카드 6개 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 sm:gap-6">
        <ResultCard icon={<CheckCircle />} label="발음 정확도" value={`${(result.features.pronunciation_accuracy * 100).toFixed(1)}%`} />
        <ResultCard icon={<Volume2 />} label="발화 속도" value={`${result.features.wpm?.toFixed(1)} WPM`} />
        <ResultCard icon={<Activity />} label="억양 다양성" value={`${result.scores.intonation.toFixed(1)} / 5`} />
        <ResultCard icon={<Slash />} label="간투사 사용" value={`${result.features.filler_count}회`} />
        <ResultCard icon={<PauseCircle />} label="무음 비율" value={`${(result.features.pause_ratio * 100).toFixed(1)}%`} />
        <ResultCard icon={<AudioLines />} label="음색 안정성" value={`${result.scores.mfcc.toFixed(1)} / 5`} />
      </div>

      {/* 📊 Radar 차트 + 💡 팁 */}
      <div className="grid md:grid-cols-2 gap-8">
        <div className="p-4 bg-white border rounded-xl">
          <h4 className="text-md font-bold text-[#826BC4] mb-4 text-center">항목별 종합 점수 (0~5)</h4>
          <div className="w-full h-[300px]">
            <ResponsiveContainer>
              <RadarChart data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="category" />
                <PolarRadiusAxis angle={30} domain={[0, 5]} />
                <Radar name="Score" dataKey="value" stroke="#8884d8" fill="#8884d8" fillOpacity={0.6} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="p-4 bg-white border rounded-xl">
          <h4 className="text-md font-bold text-[#826BC4] mb-4 text-center">💡 항목별 개선 팁</h4>
          <ul className="space-y-2 text-sm text-gray-700">
            {improvementTips.map((item, idx) => (
              <li key={idx}><strong>{item.title}:</strong> {item.tip}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* 🏁 종합 점수 */}
      <div className="text-center text-xl font-semibold text-gray-700">
        전체 점수: {((Object.values(result.scores).reduce((a, b) => a + b, 0)) / 6).toFixed(1)} / 5
      </div>

      {/* 📄 STT 링크 및 다시 분석 버튼 */}
      <div className="bg-[#fdfdfd] border border-gray-200 rounded-lg p-6">
        <h4 className="text-md font-bold text-[#826BC4] mb-2">📝 종합 피드백</h4>
        <p className="text-gray-800">{result?.feedback}</p>
      </div>

      <div className="flex flex-col sm:flex-row justify-center sm:justify-end items-center space-y-3 sm:space-y-0 sm:space-x-4 mt-6">
        <button onClick={onReplay} className="px-6 py-3 bg-[#4FB8A9] text-white font-semibold rounded-lg hover:bg-[#3fa295] transition">음성 재생</button>
        <a href={result?.stt_html_url} target="_blank" rel="noopener noreferrer" className="px-6 py-3 bg-[#6B8DD6] text-white font-semibold rounded-lg hover:bg-[#5574bb] transition">발음 분석 결과</a>
        <button onClick={onReload} className="px-6 py-3 border border-gray-300 font-semibold rounded-lg hover:bg-gray-100 transition">다시 분석하기</button>
      </div>
    </div>
  );
}

// 📌 공통 카드 컴포넌트
function ResultCard({ icon, label, value }) {
  return (
    <div className="p-4 bg-white rounded-lg shadow text-center">
      <div className="mb-1 text-[#5686C4] mx-auto w-6 h-6">{icon}</div>
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
}
