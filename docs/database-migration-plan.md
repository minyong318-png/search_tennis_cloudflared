# Supabase 비파괴 마이그레이션 계획

## Phase 1: 감사 완료

- 코드 사용처 검색 완료.
- live DB row count/RLS/grant/index/function 확인 완료.
- 스키마 스냅샷 생성 완료.

## Phase 2: Public read 경계 분리 완료

- `get_public_data` RPC를 공개 조회 경계로 유지.
- raw table `facilities`, `availability_cache`, `slots_snapshot`의 anon/authenticated 직접 권한 제거 완료.

## Phase 3: 알림 쓰기 경로 이전 완료

- `Pages/index.html`의 `push_subscriptions`, `alarms` 직접 접근 제거.
- `register_push_subscription`, `add_alarm_rpc`, `list_alarms_rpc`, `delete_alarm_rpc`로 전환.
- RLS 적용 후 anon RPC 동작 검증 완료.

## Phase 4: Retention 완료

- `slots_snapshot` 30일 초과 27,812건 삭제 완료.
- 빈 `availability_cache` row는 상태 필드 도입 전까지 유지한다.

## Phase 5: Legacy 테이블 제거 완료

- `push_endpoints`, `subscriptions`, `sent_log`는 0 row이고 현재 사용처가 없어 DROP 완료.

## 완료 전 검증

- `get_public_data` anon 호출 정상.
- 코트있음 페이지 예약 결과 정상 표시.
- 알림 등록/조회/삭제 정상.
- 크롤러 service_role 또는 direct DB write 정상.
- 대회있음 Supabase sync 정상.
