# Supabase 정리 후보

실제 정리 적용 완료. 아래는 최종 상태다.

## 즉시 삭제 금지

| 대상 | 이유 |
|---|---|
| facilities | 공개 RPC와 크롤러 저장에 사용 |
| availability_cache | 공개 RPC와 크롤러 저장에 사용 |
| push_subscriptions | 현재 브라우저 알림 등록에 사용 |
| alarms | 현재 브라우저 알림 등록/조회/삭제에 사용 |
| baseline_slots | 알림 오탐 방지 기준값 |
| sent_slots | 알림 중복 발송 방지 |
| daehoe_tournaments | 대회있음 운영 데이터 |
| daehoe_sync_state | 대회있음 동기화 상태 |

## 삭제 후보

| 대상 | 현재 rows | 후보 이유 | 후속 조건 |
|---|---:|---|---|
| push_endpoints | 0 | 코드 사용처 없음 | DROP 완료 |
| subscriptions | 0 | 코드 사용처 없음 | DROP 완료 |
| sent_log | 0 | 코드 사용처 없음 | DROP 완료 |

## 보존/retention 후보

| 대상 | 현재 rows | 정리 후보 | 후속 조건 |
|---|---:|---:|---|
| slots_snapshot | 63,688 | 30일 초과 0 | 30일 초과 27,812건 삭제 완료 |
| availability_cache empty slots | 4,305 | 상태 필드 도입 전 삭제 금지 | `SUCCESS_EMPTY`와 실패 0건 구분 구조가 먼저 필요 |

## Preview SQL

- `supabase/migrations/destructive_cleanup_preview.sql`
- `supabase/migrations/cleanup_legacy_and_snapshot_retention.sql`
