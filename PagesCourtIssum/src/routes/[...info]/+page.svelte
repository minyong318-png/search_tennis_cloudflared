<script>
  export let data;

  const navLinks = [
    { href: "/about", label: "소개" },
    { href: "/guide/tennis-reservation", label: "이용 가이드" },
    { href: "/reservation-guide", label: "예약 규칙" },
    { href: "/faq", label: "FAQ" },
    { href: "/updates", label: "업데이트" },
    { href: "/data-source", label: "데이터 출처" },
    { href: "/privacy", label: "개인정보" },
    { href: "/terms", label: "약관" },
    { href: "/contact", label: "문의" }
  ];
</script>

<svelte:head>
  <title>{data.title} | 코트있음?</title>
  <meta name="description" content={data.description} />
  <link rel="canonical" href={`https://courtissum.pages.dev${data.key ? `/${data.key}` : ""}`} />
  {#if data.noindex}<meta name="robots" content="noindex,follow" />{/if}
</svelte:head>

<main class="app-page info-page">
  <section class="glass-panel info-hero">
    <span>{data.eyebrow}</span>
    <h1>{data.title}</h1>
    <p>{data.description}</p>
    <small>마지막 내용 점검: {data.updatedAt}</small>
  </section>

  <nav class="info-nav" aria-label="안내 페이지">
    {#each navLinks as link}
      <a class:active={`/${data.key}` === link.href || (!data.key && link.href === "/about")} href={link.href}>{link.label}</a>
    {/each}
  </nav>

  <section class="info-content" aria-label={`${data.title} 본문`}>
    {#each data.sections as section}
      <article class="glass-panel info-section">
        <h2>{section.heading}</h2>
        {#if section.body}<p>{section.body}</p>{/if}
        {#if section.items}
          <ul>
            {#each section.items as item}<li>{item}</li>{/each}
          </ul>
        {/if}
      </article>
    {/each}
  </section>

  <section class="glass-panel info-cta">
    <div>
      <strong>실시간 조회가 필요하신가요?</strong>
      <p>코트 잔여 시간은 수집 시점 이후 달라질 수 있습니다. 공식 예약처에서 마지막으로 확인해 주세요.</p>
    </div>
    <a class="primary-button" href="/">코트 현황으로 이동</a>
  </section>
</main>

<style>
  .info-page {
    padding-top: 34px;
    display: grid;
    gap: 18px;
  }

  .info-hero,
  .info-content,
  .info-cta,
  .info-nav {
    width: min(980px, 100%);
    margin: 0 auto;
  }

  .info-hero {
    padding: 38px;
  }

  .info-hero span {
    color: var(--accent);
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
  }

  .info-hero h1 {
    margin: 12px 0 12px;
    font-size: clamp(30px, 5vw, 48px);
    line-height: 1.1;
    letter-spacing: 0;
  }

  .info-hero p,
  .info-section p,
  .info-cta p {
    color: var(--text-secondary);
    line-height: 1.78;
  }

  .info-hero small {
    display: inline-flex;
    margin-top: 10px;
    color: var(--text-tertiary);
    font-size: 12px;
  }

  .info-nav {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .info-nav a {
    min-height: 38px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.72);
    padding: 10px 13px;
    color: #697069;
    font-size: 12px;
    font-weight: 760;
  }

  .info-nav a.active {
    background: #18201c;
    color: #fff;
  }

  .info-content {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }

  .info-section {
    padding: 26px;
  }

  .info-section h2 {
    margin: 0 0 12px;
    font-size: 21px;
    line-height: 1.32;
    letter-spacing: 0;
  }

  .info-section p {
    margin: 0;
    font-size: 14px;
  }

  .info-section ul {
    margin: 0;
    padding-left: 18px;
    color: var(--text-secondary);
    line-height: 1.72;
    font-size: 14px;
  }

  .info-section li + li {
    margin-top: 7px;
  }

  .info-cta {
    padding: 24px 28px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
  }

  .info-cta strong {
    font-size: 18px;
  }

  .info-cta p {
    margin: 7px 0 0;
    font-size: 13px;
  }

  .info-cta a {
    flex: 0 0 auto;
  }

  @media (max-width: 760px) {
    .info-page {
      padding: 18px 10px 70px;
    }

    .info-hero,
    .info-section,
    .info-cta {
      padding: 22px;
      border-radius: 22px;
    }

    .info-content {
      grid-template-columns: 1fr;
    }

    .info-cta {
      align-items: stretch;
      display: grid;
    }

    .info-cta a {
      justify-content: center;
    }
  }
</style>
