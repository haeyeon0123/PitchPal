/* 메인 페이지: 기능 및 디자인 */

import React from 'react';
import { motion } from 'framer-motion';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import ServiceIntro from './ServiceIntro';         // 서비스 소개 컴포넌트
import AnalysisContent from './Analysis_Content';  // 내용 분석 페이지
import AnalysisVoice from './Analysis_Voice';      // 음성 분석 페이지
import AnalysisVideo from './Analysis_Video';      // 영상 분석 페이지

export default function App() {
  const { pathname } = useLocation();
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

  // 홈 경로에서만 구슬 애니메이션 표시
  const showOrbs = pathname === '/';

  return (
    <div className="relative flex flex-col min-h-screen font-sans overflow-hidden">
      {/* Full-screen orbs - only on home */}
      {showOrbs && orbs}

      {/* 헤더더 */}
      <header className="relative z-20 container mx-auto flex justify-between items-center px-8 py-4">
      <Link to="/"
          className="flex items-center space-x-2 mt-2 cursor-pointer" reloadDocument>
            <img src="/assets/logo.png" alt="PitchPal" className="h-8" />
            <span className="text-2xl font-bold text-black">PitchPal</span>
            </Link>

      {/* 네비게이션바바 */}      
        <nav className="flex items-center space-x-6 text-gray-700">
          <Link to="/" className="hover:text-blue-900">홈</Link>
          <Link to="/services" className="hover:text-blue-900" reloadDocument>서비스 소개</Link>
          <Link to="/content-analysis" className="hover:text-blue-900" reloadDocument>내용 분석</Link>
          <Link to="/voice-analysis" className="hover:text-blue-900" reloadDocument>음성 분석</Link>
          <Link to="/video-analysis" className="hover:text-blue-900" reloadDocument>영상 분석</Link>
        </nav>
      </header>

      {/* Gradient underline */}
      <div className="w-full h-6 bg-gradient-to-b from-gray-100 to-transparent z-10" />

      {/* Routes */}
      <Routes>
        {/* 메인 화면 */}
        <Route
          path="/"
          element={
            <>
              <main className="relative flex flex-1 items-center justify-between px-8 py-12 z-10 -mt-16">
                <div className="w-full lg:w-1/2 pr-8 space-y-6 ml-4 lg:ml-12">
                  <motion.h1
                    className="text-6xl font-bold leading-tight"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 2 }}
                  >
                    <span className="block text-black">자신감 있는 발표의 시작,</span>
                    <span className="block">
                      <span className="bg-gradient-to-r from-[#826BC6] via-[#5686C4] to-[#3EB489] bg-clip-text text-transparent">
                        PitchPal
                      </span>과 함께하세요
                    </span>
                  </motion.h1>
                  <p className="text-lg text-gray-700">
                    언제 어디서든 AI가 실시간으로 발표를 분석하고 피드백을 제공합니다.<br />
                    지금 바로 연습을 시작해보세요.
                  </p>
                </div>
                <div className="relative inline-block transform -translate-x-[8rem] z-10">
                  <img
                    src="/assets/pitch.png"
                    alt="발표 마이크"
                    className="w-[25rem] rounded-lg"
                  />
                </div>
              </main>
              <div className="flex justify-center space-x-6 relative top-[-3rem] z-10">
                <Link
                  to="/content-analysis"
                  className="flex items-center bg-white text-black px-40 py-3 rounded-lg shadow-[0_0_80px_#dbd8ed] hover:shadow-[0_0_120px_#dbd8ed] transition"
                >
                  <img src="/assets/note.png" alt="내용 분석 아이콘" className="w-8 h-8 mr-4" />
                  <span className="text-xl font-medium">내용 분석</span>
                </Link>
                <Link
                  to="/voice-analysis"
                  className="flex items-center bg-white text-black px-40 py-3 rounded-lg shadow-[0_0_80px_rgba(135,206,235,0.5)] hover:shadow-[0_0_120px_rgba(135,206,235,0.5)] transition"
                >
                  <img src="/assets/mic.jpg" alt="음성 분석 아이콘" className="w-8 h-8 mr-4" />
                  <span className="text-xl font-medium">음성 분석</span>
                </Link>
                <Link
                  to="/video-analysis"
                  className="flex items-center bg-white text-black px-40 py-3 rounded-lg shadow-[0_0_80px_#d5f0e7] hover:shadow-[0_0_120px_#d5f0e7] transition"
                >
                  <img src="/assets/video.png" alt="영상 분석 아이콘" className="w-8 h-8 mr-4" />
                  <span className="text-xl font-medium">영상 분석</span>
                </Link>
              </div>
            </>
          }
        />

        {/* 서비스 소개 페이지 */}
        <Route path="/services" element={<ServiceIntro />} />

        {/* 분석 페이지 */}
        <Route path="/content-analysis" element={<AnalysisContent />} />
        <Route path="/voice-analysis" element={<AnalysisVoice />} />
        <Route path="/video-analysis" element={<AnalysisVideo />} />
      </Routes>
    </div>
  );
}
