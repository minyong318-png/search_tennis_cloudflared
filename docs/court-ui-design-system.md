# 코트있음 UI 디자인 시스템

## 정보 레벨

- Level 1: 시설명, 날짜, 예약 가능 시간, 공식 예약 링크.
- Level 2: 즐겨찾기, 알림, 업데이트 시각, 이용 안내.
- Level 3: facility_id, source, 원본 JSON, 크롤링 오류, DB 상태. 일반 화면에는 노출하지 않음.

## 상태 표현

- AVAILABLE: 예약 가능. 초록 계열 칩과 명확한 시간 텍스트.
- CLOSED: 마감 또는 결과 없음. 기본 결과 목록에서는 숨기고 빈 상태 문구로 안내.
- STALE: 갱신 지연. 반복 경고 대신 요약 영역 또는 공지에서 1회 안내.
- UNKNOWN: 확인 필요. 일반 오류 코드 대신 “정보를 확인할 수 없습니다”로 표시.

## 컴포넌트 기준

- SiteHeader: 서비스명, 공지/가이드, 새로고침.
- CourtFilterBar: 도시, 구, 코트, 날짜, 시간.
- QuickDateSelector: 오늘, 내일, 모레, 날짜 직접 선택.
- ResultSummary: 현재 조건의 가능 시간 수와 시설 수.
- FacilityGroup: 예약 가능한 시설 묶음.
- NotificationSheet: 접힘 영역 또는 모달.
- GuideSummary: 하단 SEO/사용자 안내 요약.

## 모션

- 기본 전환은 CSS `transition` 150~250ms 범위만 사용.
- `prefers-reduced-motion: reduce`에서 모션을 최소화.
- 예약 버튼 주변에는 시선 유도 애니메이션을 사용하지 않음.

