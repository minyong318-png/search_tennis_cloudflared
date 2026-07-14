# Supabase RLS 접근 매트릭스

## 현재 위험

기존에는 `daehoe_*`를 제외한 주요 public 테이블 RLS가 꺼져 있고, `anon`/`authenticated`에 SELECT/INSERT/UPDATE/DELETE/TRUNCATE 등 광범위 권한이 열려 있었다. 현재는 핵심 테이블 RLS를 켜고 raw table 권한을 제거했다.

## 목표 접근 모델

| 영역 | anon | authenticated | service_role |
|---|---|---|---|
| facilities | raw table 접근 없음 | raw table 접근 없음 | 전체 쓰기 |
| availability_cache | raw table 접근 없음 | raw table 접근 없음 | 전체 쓰기 |
| slots_snapshot | 접근 없음 | 접근 없음 | 전체 쓰기 |
| get_public_data | 실행 가능 | 실행 가능 | 실행 가능 |
| push_subscriptions | RPC 등록만 가능 | RPC 등록만 가능 | 전체 쓰기 |
| alarms | RPC 자기 알림만 가능 | RPC 자기 알림만 가능 | 전체 쓰기 |
| baseline_slots | 접근 없음 | 접근 없음 | 전체 쓰기 |
| sent_slots | 접근 없음 | 접근 없음 | 전체 쓰기 |
| daehoe_tournaments | 접근 없음 | 접근 없음 | 전체 쓰기 |
| daehoe_sync_state | 접근 없음 | 접근 없음 | 전체 쓰기 |

## 적용 순서

1. `get_public_data`를 public read boundary로 고정 완료.
2. `facilities`, `availability_cache`, `slots_snapshot` raw table 권한 제거 완료.
3. 알림 등록/조회/삭제를 브라우저 직접 table write에서 RPC로 이전 완료.
4. 알림 테이블 RLS 활성화 완료.
5. 0 row legacy 후보 테이블 DROP 완료.

## Preview SQL

- `supabase/migrations/rls_policies_preview.sql`
- `supabase/migrations/notification_rpc_and_rls.sql`
