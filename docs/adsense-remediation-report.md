# AdSense Remediation Report

Date: 2026-07-19

## 변경 파일

- `PagesCourtIssum/src/routes/+page.svelte`
- `PagesCourtIssum/src/routes/daehoe/+page.svelte`
- `PagesCourtIssum/src/routes/[...info]/+page.js`
- `PagesCourtIssum/src/routes/[...info]/+page.svelte`
- `PagesCourtIssum/src/lib/components/AppShell.svelte`
- `PagesCourtIssum/static/sitemap.xml`
- `docs/adsense-content-audit.md`
- `docs/adsense-remediation-report.md`

## 해결한 문제

- 메인 페이지가 단순 조회 도구로만 보이지 않도록 데이터 요약, 고유 가치, 사용 방법, 예약 규칙, FAQ 콘텐츠를 추가했다.
- 짧은 정책/안내 페이지를 구조화된 본문 페이지로 확장했다.
- 주요 안내 페이지를 footer와 sitemap에 연결했다.
- 대회있음 오른쪽 지역별 일정 레일은 테니스타운 데이터를 제외하고 협회, 기관, 시설 공지 기반 지역 대회만 표시하도록 변경했다.

## 신규 라우트

- `/about/`
- `/reservation-guide/`
- `/faq/`
- `/updates/`

기존 `/guide/tennis-reservation/`, `/privacy/`, `/terms/`, `/data-source/`, `/contact/`도 본문을 확장했다.

## SSR/캐시/오류 처리

- 메인 설명 콘텐츠와 정보 페이지 본문은 JavaScript 실행 전 서버 HTML에 포함되는 SvelteKit 정적 빌드 대상이다.
- 코트 데이터 API가 실패해도 메인 설명 콘텐츠는 유지된다.
- 알 수 없는 catch-all 안내 경로는 `noindex,follow`를 제공한다.

## 광고 렌더링 조건

- 이번 작업에서는 광고 런타임 스크립트를 새로 추가하지 않았다.
- 기존 광고 placeholder는 조회 UI, 날짜 이동, 필터, 예약 버튼과 직접 겹치지 않는 하단/레일 영역에 유지했다.
- 로딩 전용, 오류 전용, 빈 결과 전용 화면에는 광고 컴포넌트를 새로 추가하지 않았다.

## robots/sitemap/canonical

- `robots.txt`는 sitemap 경로를 유지한다.
- `sitemap.xml`에 `/daehoe/`, `/reservation-guide/`, `/faq/`, `/updates/`를 추가하고 주요 페이지 `lastmod`를 2026-07-19로 갱신했다.
- 정보 페이지는 경로별 canonical URL을 생성한다.

## 공식 출처 미확인 항목

- 지역별 예약 오픈 시각, 관내·관외 우선권, 환불 규칙은 지역과 시설마다 다르므로 임의로 채우지 않았다.
- 확인되지 않은 시설 세부 요금, 야간 조명, 주차, 샤워실 정보는 공식 정보 확인 필요로 안내한다.

## 운영자가 직접 입력해야 하는 값

- 정식 문의 이메일 또는 문의 폼 URL.
- AdSense 관리 화면의 최종 게시자 ID가 변경된 경우 `ads.txt` 값.
- 지역별 공식 예약 규칙을 시설별로 확인한 경우 상세 규칙 데이터.

## 재검토 전 수동 체크리스트

- [ ] Search Console에서 `/`, `/about/`, `/guide/tennis-reservation/`, `/reservation-guide/`, `/faq/`, `/data-source/` 서버 HTML 확인.
- [ ] AdSense 계정의 게시자 ID와 `ads.txt`가 일치하는지 확인.
- [ ] 모바일에서 조회 UI가 안내 콘텐츠 때문에 밀려 불편하지 않은지 확인.
- [ ] 문의 페이지에 실제 운영 연락 채널이 필요하면 값 확정 후 반영.
- [ ] 공식 출처 확인이 끝난 시설별 예약 규칙을 추가 데이터로 확장.
