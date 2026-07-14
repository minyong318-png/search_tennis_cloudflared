# 데이터 보존 정책 초안

## 코트 예약 데이터

- `facilities`: 현재 활성 시설 유지. stale facility는 크롤러 prune 로직으로 관리.
- `availability_cache`: 현재/미래 예약 조회 기간 유지. 과거 row는 삭제.
- 빈 슬롯 row: 예약 없음과 수집 실패를 구분하는 상태 필드 도입 전까지 삭제하지 않음.
- `slots_snapshot`: 최근 30일 과거 + 현재/미래 유지, 30일 초과는 삭제 후보.

## 알림 데이터

- `push_subscriptions`: 사용자가 직접 해제하거나 장기 실패가 누적되기 전까지 유지.
- `alarms`: 날짜가 지난 알림은 기존 cleanup 로직으로 삭제.
- `baseline_slots`: 알림 조건 기준값. 알림 만료와 함께 정리.
- `sent_slots`: 중복 발송 방지. 90일 보존 후보.

## 대회 데이터

- `daehoe_tournaments`: source별 최신 active/inactive 상태 유지.
- 원본 payload는 당분간 보존하되, public 페이지에는 정규화된 정적 JSON만 노출.
- `daehoe_sync_state`: 최신 동기화 상태 유지.

## 삭제 원칙

- 운영 DB에서 즉시 DROP/DELETE/TRUNCATE 하지 않음.
- 먼저 preview SQL로 영향 row count를 확인.
- 사용자 승인 후 destructive SQL을 별도 파일로 만들고 실행.

