import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import ServiceIntro from './ServiceIntro';
import AnalysisContent from './Analysis_Content';
import AnalysisVoice from './Analysis_Voice';
import AnalysisVideo from './Analysis_Video';

export default function App() {
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const orbColors = ['#826BC6', '#5686C4', '#3EB489'];
  const orbs = Array.from({ length: 10 }).map((_, i) => {
    const size = Math.random() * 12 + 8;
    const color = orbColors[i % orbColors.length];
    const leftPercent = Math.random() * 100;
    const topPercent = Math.random() * 80 + 15;
    const offset = 50;
    const animateX = Math.random() * offset * 2 - offset;
    const animateY = Math.random() * offset * 2 - offset;
    const duration = Math.random() * 5 + 5;
    return (
      <motion.div
        key={i}
        className="absolute rounded-full"
        style={{
          width: size,
          height: size,
          backgroundColor: color,
          left: `${leftPercent}%`,
          top: `${topPercent}%`,
          opacity: 0.5,
          filter: 'drop-shadow(0 0 5px rgba(0,0,0,0.2))',
        }}
        animate={{ x: animateX, y: animateY, opacity: 0.5 }}
        transition={{ repeat: Infinity, repeatType: 'mirror', duration, ease: 'easeInOut' }}
      />
    );
  });

  const showOrbs = pathname === '/';

  return (
    <div className="relative flex flex-col min-h-screen font-sans overflow-hidden">
      {showOrbs && orbs}

      {/* 헤더 */}
      <header className="relative z-20 container mx-auto flex justify-between items-center px-8 py-4 flex-wrap">
        <Link to="/" className="flex items-center space-x-2 mt-2 cursor-pointer" reloadDocument>
          <img src="/assets/logo.png" alt="PitchPal" className="h-8" />
          <span className="text-2xl font-bold text-black">PitchPal</span>
        </Link>

        {/* PC 전용 메뉴 */}
        <nav className="hidden md:flex items-center space-x-6 text-gray-700">
          <Link to="/" className="hover:text-blue-900">홈</Link>
          <Link to="/services" className="hover:text-blue-900" reloadDocument>서비스 소개</Link>
          <Link to="/content-analysis" className="hover:text-blue-900" reloadDocument>내용 분석</Link>
          <Link to="/voice-analysis" className="hover:text-blue-900" reloadDocument>음성 분석</Link>
          <Link to="/video-analysis" className="hover:text-blue-900" reloadDocument>영상 분석</Link>
        </nav>

        {/* 모바일 메뉴 - header 내부로 이동 */}
        {menuOpen && (
          <div className="md:hidden absolute top-full left-0 w-full bg-white shadow-md px-6 py-4 space-y-2 text-gray-700 z-40">
            <Link to="/" onClick={() => setMenuOpen(false)} className="block">홈</Link>
            <Link to="/services" onClick={() => setMenuOpen(false)} className="block">서비스 소개</Link>
            <Link to="/content-analysis" onClick={() => setMenuOpen(false)} className="block">내용 분석</Link>
            <Link to="/voice-analysis" onClick={() => setMenuOpen(false)} className="block">음성 분석</Link>
            <Link to="/video-analysis" onClick={() => setMenuOpen(false)} className="block">영상 분석</Link>
          </div>
        )}

        {/* 모바일 햄버거 메뉴 */}
        <div className="md:hidden absolute right-4 top-6 z-50">
          <button onClick={() => setMenuOpen(!menuOpen)} className="text-3xl text-gray-700">
            ☰
          </button>
        </div>
      </header>

      {/* 모바일 메뉴 */}
      

      {/* Gradient underline */}
      <div className="w-full h-6 bg-gradient-to-b from-gray-100 to-transparent z-10" />

      <Routes>
        <Route
          path="/"
          element={
            <>
              <main className="relative flex flex-col md:flex-row flex-1 items-center justify-between px-8 pt-20 md:pt-0 pb-32 md:pb-0 z-10 -mt-16">
                <div className="w-full lg:w-1/2 pr-8 ml-10 space-y-6 text-center md:text-left">
                  <motion.h1 className="text-4xl sm:text-5xl md:text-6xl font-bold leading-tight break-words"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 2 }}
                  >
                    <span className="block text-black mb-2">자신감 있는 발표의 시작,</span>
<span className="block">
                      <span className="bg-gradient-to-r from-[#826BC6] via-[#5686C4] to-[#3EB489] bg-clip-text text-transparent">
                        PitchPal
                      </span>과 함께하세요
                    </span>
                  </motion.h1>
                  <p className="text-base md:text-lg text-gray-700 leading-none">
  <span className="block md:inline">언제 어디서든 AI가 실시간으로</span><br className="md:hidden" />
  <span className="block md:inline">발표를 분석하고 피드백을 제공합니다.</span><br className="md:hidden" />
  <span className="block md:inline">지금 바로 연습을 시작해보세요.</span>
</p>
                </div>
                <div className="relative inline-block z-10 mt-12 md:mt-0 md:-translate-x-[8rem]">
                  <img
                    src="/assets/pitch.png"
                    alt="발표 마이크"
                    className="w-[16rem] md:w-[25rem] mx-auto md:mx-0 rounded-lg"
                  />
                </div>
              </main>
              <div className="flex flex-col md:flex-row justify-center items-center md:space-x-6 space-y-4 md:space-y-0 relative top-[-3.5rem] z-10 px-4 mt-8">
                <Link
                  to="/content-analysis"
                  className="flex items-center justify-center bg-white text-black px-40 py-3 rounded-lg shadow-[0_0_80px_#dbd8ed] hover:shadow-[0_0_120px_#dbd8ed] transition w-full md:w-auto"
                >
                  <img src="/assets/note.png" alt="내용 분석 아이콘" className="w-8 h-8 mr-4" />
                  <span className="text-xl font-medium">내용 분석</span>
                </Link>
                <Link
                  to="/voice-analysis"
                  className="flex items-center justify-center bg-white text-black px-40 py-3 rounded-lg shadow-[0_0_80px_rgba(135,206,235,0.5)] hover:shadow-[0_0_120px_rgba(135,206,235,0.5)] transition w-full md:w-auto"
                >
                  <img src="/assets/mic.jpg" alt="음성 분석 아이콘" className="w-8 h-8 mr-4" />
                  <span className="text-xl font-medium">음성 분석</span>
                </Link>
                <Link
                  to="/video-analysis"
                  className="flex items-center justify-center bg-white text-black px-40 py-3 rounded-lg shadow-[0_0_80px_#d5f0e7] hover:shadow-[0_0_120px_#d5f0e7] transition w-full md:w-auto"
                >
                  <img src="/assets/video.png" alt="영상 분석 아이콘" className="w-8 h-8 mr-4" />
                  <span className="text-xl font-medium">영상 분석</span>
                </Link>
              </div>
            </>
          }
        />
        <Route path="/services" element={<ServiceIntro />} />
        <Route path="/content-analysis" element={<AnalysisContent />} />
        <Route path="/voice-analysis" element={<AnalysisVoice />} />
        <Route path="/video-analysis" element={<AnalysisVideo />} />
      </Routes>
    </div>
  );
}
