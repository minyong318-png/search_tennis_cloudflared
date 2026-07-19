<script>
  export let open = false;
  export let title = "";
  export let labelledBy = "drawer-title";
  export let side = "right";
  export let onClose = () => {};
</script>

{#if open}
  <button class="overlay" type="button" aria-label="닫기" on:click={onClose}></button>
  <div class:bottom={side === "bottom"} class="drawer" role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabindex="-1">
    <div class="drawer-head">
      <strong id={labelledBy}>{title}</strong>
      <button class="close-btn" type="button" aria-label="닫기" on:click={onClose}>×</button>
    </div>
    <slot />
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 120;
    padding: 0;
    border: 0;
    background: rgba(21, 26, 22, 0.13);
    backdrop-filter: blur(3px);
  }

  .drawer {
    position: fixed;
    right: 14px;
    top: 14px;
    bottom: 14px;
    z-index: 130;
    width: min(430px, calc(100vw - 28px));
    margin: 0;
    overflow: auto;
    border: 1px solid rgba(255, 255, 255, 0.96);
    border-radius: 30px;
    background: rgba(251, 252, 250, 0.94);
    box-shadow: 0 35px 100px rgba(28, 35, 30, 0.20);
    backdrop-filter: saturate(170%) blur(30px);
    padding: 22px;
    animation: drawerIn 500ms var(--ease-spring);
  }

  .drawer-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    margin-bottom: 24px;
  }

  .drawer-head strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 22px;
    font-weight: 760;
    letter-spacing: 0;
    white-space: nowrap;
  }

  .close-btn {
    width: 34px;
    height: 34px;
    border: 0;
    border-radius: 50%;
    background: rgba(24, 29, 25, 0.055);
    font-size: 19px;
  }

  @keyframes drawerIn {
    from {
      opacity: 0;
      transform: translateX(calc(100% + 30px)) scale(0.985);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  @media (max-width: 760px) {
    .drawer,
    .drawer.bottom {
      top: auto;
      left: 0;
      right: 0;
      bottom: 0;
      width: 100%;
      max-height: 86dvh;
      border-radius: 24px 24px 0 0;
      padding: 20px 18px calc(22px + env(safe-area-inset-bottom));
      animation-name: sheetIn;
    }

    .drawer-head {
      margin-bottom: 18px;
    }

    .drawer-head strong {
      font-size: 19px;
    }

    @keyframes sheetIn {
      from {
        opacity: 0;
        transform: translateY(100%);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }
  }
</style>
