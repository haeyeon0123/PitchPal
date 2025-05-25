// ~~~ 팀원 소개 페이지 일단 보류 ~~~ //


/* 팀원 소개 페이지: 기능 및 디자인 */

import React from 'react';

export default function Team() {
  // 각 카드별 멤버 정보: [학교, 전공, 이름]
  const members = [
    ['숙명여자대학교', 'IT공학전공', '박세은'],
    ['숙명여자대학교', 'IT공학전공', '최예은'],
    ['숙명여자대학교', 'IT공학전공', '홍혜연'],
  ];

  return (
    <div className="container mx-auto px-8 py-24">
      <div className="flex flex-wrap justify-center gap-8">
        {members.map((info, index) => (
          <div
            key={index}
            className="bg-white rounded-lg shadow-md w-64 h-96 p-4 flex flex-col items-center relative z-20"
          >
            {/* 이미지 자리 (위쪽 중앙) - 크기 확장 유지 */}
            <div className="w-40 h-40 bg-gray-200 rounded-lg mb-4" />

            {/* 텍스트 자리 (아래쪽, 3줄) */}
            <div className="mt-auto text-center space-y-2">
              <p>{info[0]}</p>
              <p>{info[1]}</p>
              <p>{info[2]}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
