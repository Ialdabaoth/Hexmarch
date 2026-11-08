<script lang="ts">
  import { holdMenu } from '../lib/hold.svelte';

  // Each choice copies the held button's frame so it reads as a choice about that button.
  const frame = $derived(`width:${holdMenu.w}px; height:${holdMenu.h}px; border-radius:${holdMenu.radius}`);
</script>

{#if holdMenu.open}
  <div class="hold no-print" aria-hidden="true">
    <div class="bubble easy" class:on={holdMenu.hover === 'easy'}
      style="left:{holdMenu.x}px; top:{holdMenu.y - holdMenu.offset}px; {frame}">Easy</div>
    <div class="bubble hard" class:on={holdMenu.hover === 'hard'}
      style="left:{holdMenu.x}px; top:{holdMenu.y + holdMenu.offset}px; {frame}">Hard</div>
    <!-- Arrows sit on each choice's near edge, nudging toward it: swipe up for Easy, down for Hard. -->
    <div class="arrow up" style="left:{holdMenu.x}px; top:{holdMenu.y - holdMenu.offset + holdMenu.h / 2}px">
      <svg viewBox="0 0 12 12"><path d="M2.5 8 6 4.5 9.5 8" /></svg>
    </div>
    <div class="arrow down" style="left:{holdMenu.x}px; top:{holdMenu.y + holdMenu.offset - holdMenu.h / 2}px">
      <svg viewBox="0 0 12 12"><path d="M2.5 4 6 7.5 9.5 4" /></svg>
    </div>
  </div>
{/if}

<style>
  .hold { position: fixed; inset: 0; z-index: 50; pointer-events: none; background: rgb(0 0 0 / 0.08); }
  .bubble {
    position: absolute;
    transform: translate(-50%, -50%);
    display: grid;
    place-items: center;
    font: 700 1rem Georgia, serif;
    background: #111;
    color: #fff;
    border: 2px solid #111;
    box-shadow: 0 4px 16px rgb(0 0 0 / 0.25);
    transition: transform 0.08s ease-out, background 0.08s;
  }
  /* Keep each label clear of the arrow sitting on its near edge. */
  .easy { padding-bottom: 12px; }
  .hard { padding-top: 12px; }
  .bubble.on { transform: translate(-50%, -50%) scale(1.08); }
  .easy.on { background: var(--good); border-color: var(--good); }
  .hard.on { background: var(--accent); border-color: var(--accent); }
  .arrow {
    position: absolute;
    width: 20px;
    height: 20px;
    margin: -10px 0 0 -10px;
    border-radius: 50%;
    border: 2px solid var(--card);
    box-shadow: 0 1px 4px rgb(0 0 0 / 0.3);
    display: grid;
    place-items: center;
  }
  .arrow svg { width: 12px; height: 12px; fill: none; stroke: #fff; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
  .arrow.up { background: var(--good); animation: nudge-up 0.9s ease-in-out infinite; }
  .arrow.down { background: var(--accent); animation: nudge-down 0.9s ease-in-out infinite; }
  @keyframes nudge-up { 50% { transform: translateY(-3px); } }
  @keyframes nudge-down { 50% { transform: translateY(3px); } }
  @media (prefers-reduced-motion: reduce) { .arrow { animation: none !important; } }
</style>
