# slots_snapshot retention 보고서

## 현재 상태

- 전체 rows: 63,688
- 30일 초과 rows: 0
- 삭제된 30일 초과 rows: 27,812

## 현재 사용처

- `Serch_Tennis_Fly/refresh_and_notify.py`
  - 슬롯 변화 기록
  - 알림 후보 생성/중복 발송 방지 보조
  - 시설/날짜 단위로 계속 갱신

## 권장 retention

- 현재 날짜 이후: 유지
- 최근 과거 30일: 유지
- 30일 초과: 삭제 적용 완료

## 주의

- 알림 중복 방지의 핵심은 `sent_slots`와 `baseline_slots`이므로, 30일 초과 snapshot 삭제는 기능 영향이 낮아 보인다.
- 그래도 실제 삭제 전 운영 크롤러 1회와 알림 경로 1회를 통과 확인해야 한다.

## Preview SQL

- `supabase/migrations/cleanup_snapshot_retention_preview.sql`
- `supabase/migrations/cleanup_legacy_and_snapshot_retention.sql`
