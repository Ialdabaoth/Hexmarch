<script lang="ts">
  import type { Character } from '../lib/character';
  import XpPanel from './XpPanel.svelte';

  let { character: c, onclose }: { character: Character; onclose: () => void } = $props();
</script>

<div class="scrim no-print" role="presentation" onclick={onclose}>
  <div class="box card" role="dialog" aria-modal="true" aria-label="Experience and level up" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.key === 'Escape' && onclose()}>
    <div class="small muted">{c.name} · level {c.level}</div>
    <XpPanel character={c} />
    <button class="primary" onclick={onclose}>Done</button>
  </div>
</div>

<style>
  .scrim { position: fixed; inset: 0; z-index: 40; background: rgb(0 0 0 / 0.35); display: grid; place-items: center; padding: 16px; }
  .box { width: min(360px, 100%); display: flex; flex-direction: column; gap: 0.75rem; }
</style>
