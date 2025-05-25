/* 서비스 소개 페이지: 기능 및 디자인 */

import React from 'react';
import { Link } from 'react-router-dom';
import {
  FileText,
  Mic2,
  Video,
  Globe2,
  Monitor,
  DollarSign,
  CheckCircle,
  TrendingUp,
  Smile
} from 'lucide-react';

const ServiceIntro = () => {
  return (
    <div className="bg-white">
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-[#A68ED5] to-[#6EAED5] text-white py-20">
        <div className="container mx-auto text-center px-4">
          <h1 className="text-4xl font-bold mb-4">PitchPal</h1>
          <p className="text-lg mb-6">
            AI가 실시간으로 발표 연습을 도와주는 스마트 발표 플랫폼
          </p>
          {/* 변경: 홈 화면으로 이동 */}
          <Link
            to="/"
            className="inline-block bg-white hover:bg-gray-100 text-[#000000] font-normal px-6 py-3 rounded-full transition"
          >
            지금 연습 시작하기
          </Link>
        </div>
      </section>

      {/* Core Features Section */}
      <section className="container mx-auto py-16 px-4">
        <h2 className="text-3xl font-bold text-[#826BC6] text-center mb-12">
          핵심 기능
        </h2>
        <div className="grid md:grid-cols-3 gap-8">
          <div className="text-center p-6 border rounded-3xl shadow-[0_0_50px_#dbd8ed] hover:shadow-[0_0_120px_#dbd8ed] transition">
            <FileText className="mx-auto mb-4 w-12 h-12 text-[#826BC6]" />
            <h3 className="text-xl font-semibold text-[#826BC6] mb-2">내용 분석</h3>
            <p>맞춤법 검사 및 교정, 시각화된 수정사항 제공</p>
          </div>
            <div className="text-center p-6 border rounded-3xl shadow-[0_0_50px_#dbd8ed] hover:shadow-[0_0_120px_#dbd8ed] transition">
            <Mic2 className="mx-auto mb-4 w-12 h-12 text-[#826BC6]" />
            <h3 className="text-xl font-semibold text-[#826BC6] mb-2">음성 분석</h3>
            <p>속도 · 발음 · 불필요한 단어 · 어간 공백 · 억양 분석 및 시각화</p>
          </div>
            <div className="text-center p-6 border rounded-3xl shadow-[0_0_50px_#dbd8ed] hover:shadow-[0_0_120px_#dbd8ed] transition">
            <Video className="mx-auto mb-4 w-12 h-12 text-[#826BC6]" />
            <h3 className="text-xl font-semibold text-[#826BC6] mb-2">영상 분석</h3>
            <p>각도 · 눈 깜빡임 빈도 · 표정 변화 · 시선 처리 분석 및 피드백</p>
          </div>
        </div>
      </section>

      {/* Convenience Section */}
      <section className="container mx-auto py-16 px-4">
        <h2 className="text-3xl font-bold text-[#5686C4] text-center mb-12">
          이용 안내
        </h2>
        <div className="grid md:grid-cols-3 gap-8">
          <div className="text-center p-6 border rounded-3xl shadow-[0_0_50px_rgba(135,206,235,0.5)] hover:shadow-[0_0_120px_rgba(135,206,235,0.5)] transition">
            <Globe2 className="mx-auto mb-4 w-12 h-12 text-[#5686C4]" />
            <h3 className="text-xl font-semibold text-[#5686C4] mb-2">언제 · 어디서나</h3>
            <p>별도 설치 없이 이용 가능</p>
          </div>
          <div className="text-center p-6 border rounded-3xl shadow-[0_0_50px_rgba(135,206,235,0.5)] hover:shadow-[0_0_120px_rgba(135,206,235,0.5)] transition">
            <Monitor className="mx-auto mb-4 w-12 h-12 text-[#5686C4]" />
            <h3 className="text-xl font-semibold text-[#5686C4] mb-2">자유로운 기기 사용</h3>
            <p>PC, 태블릿, 스마트폰 모두 지원</p>
          </div>
          <div className="text-center p-6 border rounded-3xl shadow-[0_0_50px_rgba(135,206,235,0.5)] hover:shadow-[0_0_120px_rgba(135,206,235,0.5)] transition">
            <DollarSign className="mx-auto mb-4 w-12 h-12 text-[#5686C4]" />
            <h3 className="text-xl font-semibold text-[#5686C4] mb-2">무료 이용</h3>
            <p>모든 기능 무료</p>
          </div>
        </div>
      </section>

      {/* Expected Outcomes Section */}
      <section className="container mx-auto py-16 px-4">
        <h2 className="text-3xl font-bold text-[#3EB489] text-center mb-12">
          기대 효과
        </h2>
        <div className="grid md:grid-cols-3 gap-8">
          <div className="text-center p-6 border rounded-3xl shadow-[0_0_50px_#d5f0e7] hover:shadow-[0_0_120px_#d5f0e7] transition">
            <CheckCircle className="mx-auto mb-4 w-12 h-12 text-[#3EB489]" />
            <h3 className="text-xl font-semibold text-[#3EB489] mb-2">약점 보완</h3>
            <p>개인 맞춤형 학습 가능</p>
          </div>
          <div className="text-center p-6 border rounded-3xl shadow-[0_0_50px_#d5f0e7] hover:shadow-[0_0_120px_#d5f0e7] transition">
            <TrendingUp className="mx-auto mb-4 w-12 h-12 text-[#3EB489]" />
            <h3 className="text-xl font-semibold text-[#3EB489] mb-2">수준 향상</h3>
            <p>전반적인 발표 능력 향상</p>
          </div>
          <div className="text-center p-6 border rounded-3xl shadow-[0_0_50px_#d5f0e7] hover:shadow-[0_0_120px_#d5f0e7] transition">
            <Smile className="mx-auto mb-4 w-12 h-12 text-[#3EB489]" />
            <h3 className="text-xl font-semibold text-[#3EB489] mb-2">긴장 완화</h3>
            <p>연습 및 교정을 통한 심리적 부담 완화</p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default ServiceIntro;