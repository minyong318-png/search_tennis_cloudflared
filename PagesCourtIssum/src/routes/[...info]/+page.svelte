<script>
  export let data;
</script>

<svelte:head>
  <title>{data.title} | 코트있음?</title>
</svelte:head>

<main class="app-page info-page">
  <section class="glass-panel info-card">
    <span>Information</span>
    <h1>{data.title}</h1>
    <p>{data.body}</p>
    <a class="primary-button" href="/">코트 현황으로 돌아가기</a>
  </section>
</main>

<style>
  .info-page {
    padding-top: 42px;
  }

  .info-card {
    max-width: 760px;
    margin: 0 auto;
    padding: 34px;
  }

  .info-card span {
    color: var(--accent);
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
  }

  .info-card h1 {
    margin: 12px 0 14px;
    font-size: 34px;
    letter-spacing: 0;
  }

  .info-card p {
    margin: 0 0 24px;
    color: var(--text-secondary);
    line-height: 1.8;
  }

  .info-card a {
    display: inline-flex;
    align-items: center;
  }
</style>
