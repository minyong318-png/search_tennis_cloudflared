# Supabase 운영 DB 기준선

기준: 2026-07-14 live project `fqrvdwfyemdpalvtvccl`

## 테이블별 현재 상태

| 테이블 | rows | RLS | 현재 판단 |
|---|---:|---|---|
| facilities | 430 | on | 코트있음 공개 RPC/크롤러 저장에 사용 |
| availability_cache | 10,316 | on | 코트있음 공개 RPC/크롤러 저장에 사용 |
| slots_snapshot | 63,688 | on | 알림 중복/변화 감지 보조. 30일 초과 정리 완료 |
| push_subscriptions | 87 | on | 알림 RPC 등록에 사용 |
| alarms | 0 | on | 알림 RPC 등록/조회/삭제에 사용 |
| baseline_slots | 73 | on | 알림 기준값 저장에 사용 |
| sent_slots | 30 | on | 알림 중복 발송 방지에 사용 |
| push_endpoints | 0 | dropped | 사용처 없음. 삭제 완료 |
| subscriptions | 0 | dropped | 사용처 없음. 삭제 완료 |
| sent_log | 0 | dropped | 사용처 없음. 삭제 완료 |
| daehoe_tournaments | 2,033 | on | 대회있음 서버 동기화 테이블 |
| daehoe_sync_state | 1 | on | 대회있음 서버 동기화 상태 |

## 주요 수치

- `availability_cache` 빈 슬롯 row: 4,305 / 10,316
- `availability_cache` 과거 row: 0
- `slots_snapshot` 30일 초과 row: 0
- `facilities` prefix: yongin 186, goyang 63, seongnam 50, paju 47, anyang 25, hanam 20, incheon 20, uiwang 16, ggshare 2, suwon 1
- `daehoe_tournaments` source: TENNISTOWN_APP 1,716, TENNISTOWN 157, LOCAL_ASSOC 47, KTA 46, KATA 30, KATO 29, FACILITY_NOTICE 8

## 백업

- 스키마 스냅샷: `supabase/backups/schema-before-cleanup.sql`
- 데이터 row dump는 생성하지 않음. push endpoint/auth 값 등 민감정보를 파일에 남기지 않기 위함.

## 적용 완료

- `supabase/migrations/notification_rpc_and_rls.sql`
- `supabase/migrations/cleanup_legacy_and_snapshot_retention.sql`
