export function load({ params }) {
  const key = params.info || "";
  const pages = {
    "guide/tennis-reservation": {
      title: "이용 가이드",
      body: "코트있음?과 대회있음?은 공식 예약처와 대회 주최 측 정보를 더 빠르게 찾도록 돕는 정보 제공 서비스입니다."
    },
    privacy: {
      title: "개인정보처리방침",
      body: "서비스 운영에 필요한 최소한의 정보만 사용하며, 알림 기능을 연결하는 단계에서는 수집 항목과 보관 기간을 별도로 고지합니다."
    },
    terms: {
      title: "이용약관",
      body: "예약, 결제, 대회 신청은 각 공식 사이트와 주최 측 기준을 따릅니다. 표시된 정보는 수집 시점에 따라 실제 현황과 다를 수 있습니다."
    },
    "data-source": {
      title: "데이터 출처",
      body: "공공 예약처와 테니스 대회 공개 페이지에서 확인 가능한 정보를 크롤링해 정리합니다."
    },
    contact: {
      title: "문의",
      body: "오류 제보, 데이터 출처 추가, 기능 요청은 운영자에게 전달해 주세요."
    }
  };

  return pages[key] || {
    title: "안내",
    body: "요청하신 안내 페이지를 준비 중입니다."
  };
}
