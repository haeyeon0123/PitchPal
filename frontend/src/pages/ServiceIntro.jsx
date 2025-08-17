import React from 'react';
import { Link } from 'react-router-dom';
import {
  FileText, Mic2, Video,
  Globe2, Monitor, DollarSign,
  CheckCircle, TrendingUp, Smile
} from 'lucide-react';
import { motion } from 'framer-motion';

const container = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.15 // 더 부드러운 속도
    }
  }
};

const item = {
  hidden: { opacity: 0, y: 30 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: "easeOut",
      type: "tween"
    }
  }
};

const ServiceIntro = () => {
  return (
    <div className="bg-white">

      {/* Hero Section */}
      <section className="bg-gradient-to-r from-[#A68ED5] to-[#6EAED5] text-white py-20">
        <div className="container mx-auto text-center px-4">
          <motion.h1
            className="text-4xl font-bold mb-4"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            PitchPal
          </motion.h1>
          <motion.p
            className="text-lg mb-6"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: "easeOut", delay: 0.2 }}
          >
            AI가 실시간으로 발표 연습을 도와주는 스마트 발표 플랫폼
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.4 }}
          >
            <Link
              to="/"
              className="inline-block bg-white hover:bg-gray-100 text-[#000000] font-normal px-6 py-3 rounded-full transition transform hover:scale-105"
            >
              지금 연습 시작하기
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Core Features Section */}
      <section className="container mx-auto py-20 px-4">
        <motion.h2
          className="text-3xl font-bold text-[#826BC6] text-center mb-12"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          핵심 기능
        </motion.h2>
        <motion.div
          className="grid md:grid-cols-3 gap-8"
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
        >
          {[{
            icon: <FileText className="mx-auto mb-4 w-12 h-12 text-[#826BC6]" />,
            title: "내용 분석",
            desc: "맞춤법 검사 및 교정, 시각화된 수정사항 제공"
          }, {
            icon: <Mic2 className="mx-auto mb-4 w-12 h-12 text-[#826BC6]" />,
            title: "음성 분석",
            desc: "속도 · 발음 · 불필요한 단어 · 어간 공백 · 억양 분석 및 시각화"
          }, {
            icon: <Video className="mx-auto mb-4 w-12 h-12 text-[#826BC6]" />,
            title: "영상 분석",
            desc: "각도 · 눈 깜빡임 빈도 · 표정 변화 · 시선 처리 분석 및 피드백"
          }].map((card, index) => (
            <motion.div
              key={index}
              className="text-center p-6 border rounded-3xl shadow-[0_0_50px_#dbd8ed] hover:shadow-[0_0_120px_#dbd8ed] transition transform hover:scale-105"
              variants={item}
            >
              {card.icon}
              <h3 className="text-xl font-semibold text-[#826BC6] mb-2">{card.title}</h3>
              <p>{card.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Convenience Section */}
      <section className="container mx-auto py-20 px-4">
        <motion.h2
          className="text-3xl font-bold text-[#5686C4] text-center mb-12"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          이용 안내
        </motion.h2>
        <motion.div
          className="grid md:grid-cols-3 gap-8"
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
        >
          {[{
            icon: <Globe2 className="mx-auto mb-4 w-12 h-12 text-[#5686C4]" />,
            title: "언제 · 어디서나",
            desc: "별도 설치 없이 이용 가능"
          }, {
            icon: <Monitor className="mx-auto mb-4 w-12 h-12 text-[#5686C4]" />,
            title: "자유로운 기기 사용",
            desc: "PC, 태블릿, 스마트폰 모두 지원"
          }, {
            icon: <DollarSign className="mx-auto mb-4 w-12 h-12 text-[#5686C4]" />,
            title: "무료 이용",
            desc: "모든 기능 무료"
          }].map((card, index) => (
            <motion.div
              key={index}
              className="text-center p-6 border rounded-3xl shadow-[0_0_50px_rgba(135,206,235,0.5)] hover:shadow-[0_0_120px_rgba(135,206,235,0.5)] transition transform hover:scale-105"
              variants={item}
            >
              {card.icon}
              <h3 className="text-xl font-semibold text-[#5686C4] mb-2">{card.title}</h3>
              <p>{card.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Expected Outcomes Section */}
      <section className="container mx-auto py-20 px-4">
        <motion.h2
          className="text-3xl font-bold text-[#3EB489] text-center mb-12"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          기대 효과
        </motion.h2>
        <motion.div
          className="grid md:grid-cols-3 gap-8"
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
        >
          {[{
            icon: <CheckCircle className="mx-auto mb-4 w-12 h-12 text-[#3EB489]" />,
            title: "약점 보완",
            desc: "개인 맞춤형 학습 가능"
          }, {
            icon: <TrendingUp className="mx-auto mb-4 w-12 h-12 text-[#3EB489]" />,
            title: "수준 향상",
            desc: "전반적인 발표 능력 향상"
          }, {
            icon: <Smile className="mx-auto mb-4 w-12 h-12 text-[#3EB489]" />,
            title: "긴장 완화",
            desc: "연습 및 교정을 통한 심리적 부담 완화"
          }].map((card, index) => (
            <motion.div
              key={index}
              className="text-center p-6 border rounded-3xl shadow-[0_0_50px_#d5f0e7] hover:shadow-[0_0_120px_#d5f0e7] transition transform hover:scale-105"
              variants={item}
            >
              {card.icon}
              <h3 className="text-xl font-semibold text-[#3EB489] mb-2">{card.title}</h3>
              <p>{card.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>
    </div>
  );
};

export default ServiceIntro;
