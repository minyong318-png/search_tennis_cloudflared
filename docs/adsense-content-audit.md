# AdSense Content Audit

Date: 2026-07-19

| 우선순위 | 문제 | 사용자/AdSense 영향 | 관련 파일 | 수정 방식 | 검증 방법 |
|---|---|---|---|---|---|
| P0 | 정보 페이지가 제목과 짧은 문장 위주로 구성됨 | 서비스 신뢰, 운영 주체, 데이터 책임 범위가 부족해 저가치 콘텐츠로 보일 수 있음 | `PagesCourtIssum/src/routes/[...info]/+page.js`, `+page.svelte` | 소개, 이용 가이드, 예약 규칙, FAQ, 업데이트, 정책, 출처, 문의 페이지를 구조화된 본문으로 확장 | 주요 URL 서버 HTML과 `npm run build` 확인 |
| P0 | 메인 페이지 하단 설명 콘텐츠가 짧음 | 조회 도구 외 고유한 데이터 정리 가치가 충분히 드러나지 않음 | `PagesCourtIssum/src/routes/+page.svelte` | 조회 UI 아래 데이터 요약, 사용 방법, 예약 규칙, FAQ, 출처 안내를 추가 | `/` 렌더링 및 모바일 레이아웃 확인 |
| P1 | 대회 오른쪽 레일이 테니스타운 매치형 데이터까지 포함 | 사용자가 찾는 협회·기관 지역 대회 일정과 단기 매치형 대회가 섞임 | `PagesCourtIssum/src/routes/daehoe/+page.svelte` | `sourceName`, `sourceType`, `sourceUrl`, `organizer`, `host` 기준으로 테니스타운 데이터를 제외한 기관 데이터만 지역별 일정 레일에 표시 | `/daehoe` DOM과 데이터 필터 확인 |
| P1 | 주요 정보 페이지가 내부 링크로 충분히 연결되지 않음 | 크롤러와 사용자 모두 정책·출처·가이드 접근성이 낮음 | `AppShell.svelte`, `sitemap.xml` | 푸터와 sitemap에 주요 안내 페이지 추가 | `sitemap.xml`, footer DOM 확인 |
| P1 | 404 성격의 catch-all 페이지가 일반 색인될 수 있음 | 얇은 안내 페이지가 색인될 가능성 | `[...info]/+page.svelte` | 알 수 없는 안내 경로는 `noindex,follow` 메타 제공 | 존재하지 않는 경로 서버 HTML 확인 |

## 확인한 현재 구조

- 프레임워크: SvelteKit, `@sveltejs/adapter-static`, Cloudflare Pages 정적 배포.
- 메인 페이지: 클라이언트에서 코트 데이터를 받아오며, 조회 UI 아래 정적 설명 콘텐츠가 함께 prerender된다.
- 대회 페이지: `daehoe/data/tournaments.json`을 서버 로드하여 정적 빌드에 포함한다.
- robots/sitemap/ads.txt: `PagesCourtIssum/static`에서 제공한다.
- 광고 스크립트: 현재 앱 코드에서 `adsbygoogle` 또는 `googlesyndication` 런타임 스크립트는 확인되지 않았다.
- 검증 명령: `npm run check`, `npm run build`.

## 구현 원칙

- 조회 UI는 첫 화면에 유지했다.
- 확인되지 않은 예약 규칙, 요금, 환불 조건은 임의로 작성하지 않고 공식 확인 필요로 안내했다.
- 광고는 로딩, 오류, 빈 결과 화면에 새로 추가하지 않았다.
- 정보 페이지는 동일 문장 반복 대신 각 페이지 목적에 맞는 섹션형 본문으로 구성했다.
