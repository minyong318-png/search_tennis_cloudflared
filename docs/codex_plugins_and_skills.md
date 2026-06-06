# Codex Plugins And Skills For This Project

이 프로젝트를 발전시킬 때 우선 사용할 플러그인/스킬 조합입니다.

## 바로 사용 가능한 핵심 도구

| 영역 | 도구/스킬 | 용도 |
| --- | --- | --- |
| GitHub Actions | GitHub plugin, `gh` CLI | 크롤링 워크플로우 실행, 로그/아티팩트 확인, 실패 작업 재실행 |
| 데이터베이스 | Supabase plugin | `get_public_data` RPC, 테이블/마이그레이션/Edge Function 점검 |
| UI 개발 | Build Web Apps frontend skills | Pages UI 리빌딩, 반응형/상태 중심 인터페이스 개선 |
| 브라우저 QA | `node_repl`, Chrome headless | 모바일/데스크톱 스크린샷, JS 파싱, 렌더링 확인 |
| 배포 | Wrangler CLI | Cloudflare Worker/Pages 직접 배포 및 검증 |
| 운영 자동화 | Codex automation | 다음날 재검증, 주기적 로그 점검, 후속 알림 |

## 선택 도구

| 영역 | 도구/스킬 | 현재 권장 |
| --- | --- | --- |
| Figma | Figma plugin/skills | 디자인 시스템을 Figma로 관리하고 싶을 때 연결 복구 후 사용 |
| Canva | Canva plugin/skills | 공지 이미지, 소개 카드, SNS 공유 이미지가 필요할 때 사용 |
| Computer Use | Computer Use plugin | 웹 콘솔 로그인/GUI 조작이 꼭 필요할 때만 사용 |

## 프로젝트 전용 Codex Skill

로컬에 다음 스킬을 추가했습니다.

`C:\Users\Maneong\.codex\skills\tennis-availability-ops\SKILL.md`

이 스킬은 다음 작업에서 사용합니다.

- 고양/용인/수원/성남 크롤러 수정
- Supabase 저장/RPC/캐시 확인
- GitHub Actions 로그 분석
- Cloudflare Pages/Worker 배포
- UI 리디자인 및 QA
- UptimeRobot/Worker 기반 갱신 흐름 점검

## 기본 작업 원칙

- `Pages/*` 또는 `Workers/*` 변경 후에는 커밋/푸시 뒤 Wrangler로 직접 배포합니다.
- 사용자에게 보이는 변경은 `Pages/index.html` 업데이트 이력에 기록합니다.
- 공개 페이지에는 GitHub Actions trigger token을 두지 않습니다.
- `__pycache__`, `*.pyc`, `korea_gov_ca.pem`, debug artifact, screenshot은 커밋하지 않습니다.
- 크롤러 변경은 안쪽 repo `Serch_Tennis_Fly` 먼저 커밋/푸시하고, 바깥 repo에서 submodule pointer를 반영합니다.

## 빠른 검증 명령

```powershell
python -m py_compile Serch_Tennis_Fly/crawl_goyang.py Serch_Tennis_Fly/refresh_and_notify.py Serch_Tennis_Fly/crawl_suwon.py Serch_Tennis_Fly/crawl_seongnam.py
node --check Workers/src/index.js
node -e "const fs=require('fs'); const h=fs.readFileSync('Pages/index.html','utf8'); const s=[...h.matchAll(/<script(?:\\s[^>]*)?>([\\s\\S]*?)<\\/script>/gi)].map(m=>m[1]).join('\\n'); new Function(s); console.log('Pages inline JS parse ok')"
rg -n "\\?\\?|PLACEHOLDER|alert\\(|TRIGGER_URL_BASE|insertAdjacentHTML|innerHTML|CHANGE_ME|whoami|probe-gyt" Pages/index.html Workers/src/index.js Workers/wrangler.toml
```

## 권장 발전 방향

1. Supabase RPC/테이블 성능 점검과 인덱스 정리
2. UI를 날짜 중심 탐색/상태 배지/시설별 신뢰도 표시로 확장
3. GitHub Actions 로그를 Supabase 또는 별도 status table에 저장해서 웹에서 크롤러 상태 표시
4. 수원 경기공유서비스처럼 미지원/제한 사이트는 사용자에게 명확히 상태 표시
5. Worker에 공개 상태 API를 추가하되 secret 없이 rate limit 중심으로 설계
