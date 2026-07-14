# Supabase 테이블 사용처 감사

## 프론트엔드 사용

| 테이블/함수 | 사용 파일 | 사용 방식 |
|---|---|---|
| get_public_data | `Pages/index.html` | 예약 가능 데이터 공개 조회 RPC |
| register_push_subscription | `Pages/index.html` | 브라우저에서 RPC로 push endpoint 등록 |
| add_alarm_rpc | `Pages/index.html` | 브라우저에서 RPC로 알림 등록 |
| list_alarms_rpc | `Pages/index.html` | 브라우저에서 RPC로 자기 알림 조회 |
| delete_alarm_rpc | `Pages/index.html` | 브라우저에서 RPC로 자기 알림 삭제 |

## 백엔드/크롤러 사용

| 테이블 | 사용 파일 | 사용 방식 |
|---|---|---|
| facilities | `Serch_Tennis_Fly/refresh_and_notify.py` | 크롤링된 시설 메타 upsert/prune |
| availability_cache | `Serch_Tennis_Fly/refresh_and_notify.py` | 프론트 표시용 슬롯 JSON upsert/만료 삭제 |
| slots_snapshot | `Serch_Tennis_Fly/refresh_and_notify.py` | 슬롯 변화/알림 중복 감지 보조 |
| push_subscriptions | `Serch_Tennis_Fly/refresh_and_notify.py` | 알림 발송 대상 preload |
| alarms | `Serch_Tennis_Fly/refresh_and_notify.py` | 알림 조건 조회/만료 삭제 |
| baseline_slots | `Serch_Tennis_Fly/refresh_and_notify.py` | 알림 기준 슬롯 저장 |
| sent_slots | `Serch_Tennis_Fly/refresh_and_notify.py` | 사용자별 중복 발송 방지 |
| daehoe_tournaments | `PagesDaehoeIssum/scripts/sync_supabase_postgres.py` | 대회 데이터 upsert/active 상태 |
| daehoe_sync_state | `PagesDaehoeIssum/scripts/sync_supabase_postgres.py` | 대회 초기 동기화 상태 |

## 사용처 미확인 또는 deprecated 후보

| 테이블 | rows | 판단 |
|---|---:|---|
| push_endpoints | 0 | 사용처 없음. DROP 완료 |
| subscriptions | 0 | 사용처 없음. DROP 완료 |
| sent_log | 0 | 사용처 없음. DROP 완료 |

## 중요한 결론

- `push_subscriptions`와 `alarms`는 브라우저 직접 table 접근을 제거하고 RPC 경로로 전환함.
- `facilities`, `availability_cache`는 public raw table 직접 공개 대신 `get_public_data` RPC만 공개함.
- `slots_snapshot`은 UI 직접 조회가 없고 크롤러/알림 보조용이므로 public read/write를 제거함.
