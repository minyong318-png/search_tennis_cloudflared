<script>
  import { page } from "$app/stores";

  $: path = $page.url.pathname;
  $: isTournament = path.startsWith("/daehoe");

  function emitHeaderAction(name) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(`courtissum:${name}`));
    }
  }
</script>

<svelte:head>
  <meta property="og:site_name" content={isTournament ? "대회있음?" : "코트있음?"} />
</svelte:head>

<header class="app-header">
  <div class="header-inner">
    <a class="brand" href={isTournament ? "/daehoe" : "/"} aria-label={isTournament ? "대회있음 홈" : "코트있음 홈"}>
      <span class="brand-mark" aria-hidden="true"></span>
      <strong>{isTournament ? "대회있음?" : "코트있음?"}</strong>
    </a>

    <nav class="product-switch" aria-label="서비스 전환">
      <a class:active={!isTournament} class="product-pill" href="/">코트있음?</a>
      <a class:active={isTournament} class="product-pill" href="/daehoe">대회있음?</a>
    </nav>

    <span class="header-note">{isTournament ? "테니스 대회 일정과 신청 현황" : "테니스 코트 잔여 시간 조회"}</span>

    <div class="header-actions">
      <button class="icon-btn" type="button" aria-label="필터 열기" on:click={() => emitHeaderAction("open-filter")}>
        <span class="filter-icon" aria-hidden="true"></span>
      </button>
      <button class="icon-btn" type="button" aria-label="알림 열기" on:click={() => emitHeaderAction("open-alarm")}>
        <span class="bell-icon" aria-hidden="true"></span>
        <span class="badge-dot"></span>
      </button>
      <a class="icon-btn" href="/guide/tennis-reservation" aria-label="이용 가이드">
        <span class="info-icon" aria-hidden="true"></span>
      </a>
    </div>
  </div>
</header>

<slot />

<footer class="site-footer">
  <span>코트있음? · 대회있음?은 공식 예약 기관이 아닌 정보 제공 서비스입니다.</span>
  <nav aria-label="정책 및 안내">
    <a href="/privacy">개인정보처리방침</a>
    <a href="/terms">이용약관</a>
    <a href="/data-source">데이터 출처</a>
    <a href="/contact">문의</a>
    <a href="/about">소개</a>
    <a href="/guide/tennis-reservation">이용 가이드</a>
    <a href="/reservation-guide">예약 규칙</a>
    <a href="/faq">FAQ</a>
    <a href="/updates">업데이트</a>
  </nav>
</footer>

<style>
  .app-header {
    position: sticky;
    top: 0;
    z-index: 100;
    height: var(--header-height);
    border-bottom: 1px solid rgba(255, 255, 255, 0.75);
    background: rgba(247, 248, 246, 0.77);
    backdrop-filter: saturate(170%) blur(24px);
  }

  .header-inner {
    width: 100%;
    max-width: 1500px;
    height: 100%;
    margin: 0 auto;
    padding: 0 24px;
    display: flex;
    align-items: center;
    gap: 18px;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 11px;
    min-width: 0;
    font-size: 21px;
    font-weight: 790;
    letter-spacing: -0.02em;
    white-space: nowrap;
  }

  .brand strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .brand-mark {
    width: 31px;
    height: 31px;
    flex: 0 0 auto;
    border-radius: 10px;
    background: linear-gradient(145deg, #0a6846, #1b986a);
    position: relative;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.4), 0 8px 22px rgba(13, 122, 81, 0.18);
  }

  .brand-mark::before,
  .brand-mark::after {
    content: "";
    position: absolute;
    background: rgba(255, 255, 255, 0.75);
    border-radius: 99px;
  }

  .brand-mark::before {
    width: 2px;
    height: 21px;
    left: 14.5px;
    top: 5px;
  }

  .brand-mark::after {
    height: 2px;
    width: 21px;
    top: 14.5px;
    left: 5px;
    opacity: 0.48;
  }

  .product-switch {
    margin-left: 14px;
    padding: 4px;
    border-radius: 14px;
    background: rgba(21, 26, 22, 0.055);
    display: flex;
    align-items: center;
  }

  .product-pill {
    height: 35px;
    border-radius: 11px;
    padding: 0 15px;
    display: inline-flex;
    align-items: center;
    color: #777c77;
    font-size: 12px;
    font-weight: 700;
    transition: 250ms var(--ease-standard);
  }

  .product-pill.active {
    background: #fff;
    color: var(--text-primary);
    box-shadow: 0 7px 18px rgba(45, 53, 49, 0.08);
  }

  .header-note {
    color: var(--text-tertiary);
    font-size: 12px;
  }

  .header-actions {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .icon-btn {
    position: relative;
    width: 40px;
    height: 40px;
    border: 1px solid rgba(24, 29, 25, 0.07);
    border-radius: 13px;
    background: rgba(255, 255, 255, 0.62);
    display: grid;
    place-items: center;
    color: var(--text-primary);
    font-size: 16px;
    font-weight: 760;
    transition: transform 220ms var(--ease-standard), background 220ms var(--ease-standard), box-shadow 220ms var(--ease-standard);
  }

  .filter-icon,
  .bell-icon,
  .info-icon {
    width: 18px;
    height: 18px;
    display: block;
    position: relative;
  }

  .filter-icon::before {
    content: "";
    position: absolute;
    left: 2px;
    top: 4px;
    width: 14px;
    height: 10px;
    background:
      linear-gradient(#161a17, #161a17) 0 0 / 14px 1.6px no-repeat,
      linear-gradient(#161a17, #161a17) 3px 4px / 8px 1.6px no-repeat,
      linear-gradient(#161a17, #161a17) 6px 8px / 4px 1.6px no-repeat;
    border-radius: 99px;
  }

  .bell-icon::before {
    content: "";
    position: absolute;
    left: 4px;
    top: 3px;
    width: 10px;
    height: 11px;
    border: 1.7px solid #161a17;
    border-bottom: 0;
    border-radius: 8px 8px 3px 3px;
  }

  .bell-icon::after {
    content: "";
    position: absolute;
    left: 2px;
    top: 13px;
    width: 14px;
    height: 5px;
    background:
      linear-gradient(#161a17, #161a17) 0 0 / 14px 1.7px no-repeat,
      radial-gradient(circle at 50% 100%, #161a17 0 2px, transparent 2.2px);
  }

  .info-icon {
    border: 1.7px solid #161a17;
    border-radius: 50%;
  }

  .info-icon::before {
    content: "i";
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    font-size: 12px;
    font-weight: 800;
    font-family: ui-sans-serif, system-ui, sans-serif;
  }

  .icon-btn:hover {
    background: #fff;
    box-shadow: 0 7px 18px rgba(45, 53, 49, 0.08);
    transform: translateY(-1px);
  }

  .badge-dot {
    position: absolute;
    right: 4px;
    top: 4px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #129265;
    box-shadow: 0 0 0 3px rgba(18, 146, 101, 0.12);
  }

  .site-footer {
    max-width: 1500px;
    margin: 0 auto;
    padding: 28px 24px 42px;
    display: flex;
    align-items: center;
    gap: 18px;
    color: #969b96;
    font-size: 11px;
  }

  .site-footer nav {
    margin-left: auto;
    display: flex;
    gap: 18px;
    flex-wrap: wrap;
  }

  .site-footer a {
    color: #7c817c;
  }

  @media (max-width: 760px) {
    .app-header {
      height: var(--header-height);
    }

    .header-inner {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 7px 8px;
      padding: 7px 8px;
      align-content: center;
      overflow: hidden;
    }

    .brand {
      gap: 8px;
      min-width: 0;
    }

    .brand strong {
      font-size: 18px;
      line-height: 1;
    }

    .brand-mark {
      width: 27px;
      height: 27px;
      border-radius: 9px;
    }

    .brand-mark::before {
      height: 18px;
      left: 12.5px;
      top: 4.5px;
    }

    .brand-mark::after {
      width: 18px;
      left: 4.5px;
      top: 12.5px;
    }

    .product-switch {
      grid-column: 1 / -1;
      margin-left: 0;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 5px;
      width: 100%;
      max-width: 100%;
      min-width: 0;
      overflow: hidden;
      padding: 3px;
      border-radius: 12px;
    }

    .header-actions {
      grid-column: 2;
      grid-row: 1;
      margin-left: 0;
      justify-self: end;
      gap: 4px;
    }

    .icon-btn {
      width: 34px;
      height: 34px;
      border-radius: 12px;
    }

    .header-actions a.icon-btn {
      display: none;
    }

    .product-pill {
      justify-content: center;
      min-width: 0;
      height: 25px;
      padding: 0 8px;
      overflow: hidden;
      font-size: 11px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .header-note {
      display: none;
    }

    .site-footer {
      display: grid;
      padding: 22px 14px 34px;
    }

    .site-footer nav {
      margin-left: 0;
    }
  }
</style>
