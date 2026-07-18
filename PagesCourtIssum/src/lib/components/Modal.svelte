<script>
  export let open = false;
  export let title = "";
  export let onClose = () => {};
</script>

{#if open}
  <button class="overlay" type="button" aria-label="닫기" on:click={onClose}></button>
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1">
    <button class="close-btn" type="button" aria-label="닫기" on:click={onClose}>×</button>
    {#if title}<h2 id="modal-title">{title}</h2>{/if}
    <slot />
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 140;
    padding: 0;
    border: 0;
    background: rgba(21, 26, 22, 0.13);
    backdrop-filter: blur(3px);
  }

  .modal {
    position: fixed;
    left: 50%;
    top: 50%;
    z-index: 150;
    width: min(640px, calc(100vw - 28px));
    margin: 0;
    max-height: 86dvh;
    overflow: auto;
    border: 1px solid rgba(255, 255, 255, 0.97);
    border-radius: var(--radius-modal);
    background: rgba(251, 252, 250, 0.96);
    box-shadow: 0 40px 120px rgba(28, 35, 30, 0.23);
    backdrop-filter: blur(32px);
    padding: 28px;
    animation: modalIn 380ms var(--ease-spring);
  }

  .modal h2 {
    margin: 10px 42px 14px 0;
    font-size: 27px;
    line-height: 1.2;
    letter-spacing: -0.03em;
  }

  .close-btn {
    position: absolute;
    top: 20px;
    right: 20px;
    width: 34px;
    height: 34px;
    border: 0;
    border-radius: 50%;
    background: rgba(24, 29, 25, 0.055);
    font-size: 19px;
  }

  @keyframes modalIn {
    from {
      opacity: 0;
      transform: translate(-50%, -46%) scale(0.97);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
  }

  @media (max-width: 760px) {
    .modal {
      top: auto;
      bottom: 0;
      width: 100%;
      max-height: 90dvh;
      border-radius: 24px 24px 0 0;
      padding-bottom: calc(28px + env(safe-area-inset-bottom));
      animation-name: modalSheetIn;
    }

    @keyframes modalSheetIn {
      from {
        opacity: 0;
        transform: translate(-50%, 100%);
      }
      to {
        opacity: 1;
        transform: translate(-50%, 0);
      }
    }
  }
</style>
