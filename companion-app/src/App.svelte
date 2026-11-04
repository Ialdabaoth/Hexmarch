<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from './lib/app.svelte';
  import { requestPersistence } from './lib/storage';
  import Home from './components/Home.svelte';
  import Builder from './components/Builder.svelte';
  import Sheet from './components/Sheet.svelte';
  import DicePanel from './components/DicePanel.svelte';
  import Rules from './components/Rules.svelte';
  import Inbox from './components/Inbox.svelte';
  import Settings from './components/Settings.svelte';
  import Campaign from './components/Campaign.svelte';
  import CustomEquipment from './components/CustomEquipment.svelte';
  import RollResult from './components/RollResult.svelte';
  import Render from './components/Render.svelte';
  import HoldMenu from './components/HoldMenu.svelte';

  onMount(() => {
    app.load();
    requestPersistence();
  });

  const tabs = [
    { name: 'list', label: 'Party' },
    { name: 'campaign', label: 'Campaign' },
    { name: 'rules', label: 'Rules' },
    { name: 'inbox', label: 'Inbox' },
    { name: 'settings', label: '⚙️' }
  ] as const;

  let active = $derived(['build', 'sheet', 'render'].includes(app.view.name) ? 'list' : app.view.name === 'equipment' ? 'rules' : app.view.name);
  let diceOpen = $state(false);
</script>

<main class:printable={app.view.name === 'render'}>
  {#if !app.loaded}
    <p class="muted">Loading…</p>
  {:else if app.view.name === 'list'}
    <Home />
  {:else if app.view.name === 'build'}
    <Builder />
  {:else if app.view.name === 'sheet'}
    {#key app.view.id}
      <Sheet id={app.view.id} section={app.view.section} />
    {/key}
  {:else if app.view.name === 'render'}
    <Render id={app.view.id} mode={app.view.mode} />
  {:else if app.view.name === 'rules'}
    <Rules />
  {:else if app.view.name === 'inbox'}
    <Inbox />
  {:else if app.view.name === 'settings'}
    <Settings />
  {:else if app.view.name === 'campaign'}
    <Campaign />
  {:else if app.view.name === 'equipment'}
    <CustomEquipment />
  {/if}
</main>

{#if diceOpen}<DicePanel onclose={() => (diceOpen = false)} />{/if}
{#if app.view.name !== 'render' && !diceOpen}
  <button class="dice-fab no-print" onclick={() => (diceOpen = true)} aria-label="Dice and roll history" title="Dice">
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M12 2 21 7v10l-9 5-9-5V7z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 2 7.5 12 12 22M12 2l4.5 10L12 22M3 7l4.5 5L3 17M21 7l-4.5 5L21 17M7.5 12h9" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>
  </button>
{/if}

<RollResult />
<HoldMenu />

{#if app.toast}
  <div class="toast no-print" role="status">{app.toast}</div>
{/if}

<nav class="no-print">
  {#each tabs as t}
    <button class:on={active === t.name} aria-label={t.name === 'settings' ? 'Settings' : undefined} onclick={() => (app.view = { name: t.name })}>{t.label}</button>
  {/each}
</nav>

<style>
  main {
    max-width: 640px;
    margin: 0 auto;
    padding: calc(1rem + env(safe-area-inset-top)) 16px calc(9rem + env(safe-area-inset-bottom));
  }
  nav {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    background: var(--card);
    border-top: 1px solid var(--line);
    padding-bottom: env(safe-area-inset-bottom);
    z-index: 10;
  }
  nav button {
    flex: 1;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: var(--muted);
    min-height: 56px;
  }
  nav button.on {
    color: var(--accent);
    font-weight: 600;
  }
  .dice-fab {
    position: fixed;
    right: max(16px, calc(50% - 320px + 16px));
    bottom: calc(72px + env(safe-area-inset-bottom));
    width: 56px;
    height: 56px;
    min-height: 0;
    padding: 0;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--accent);
    color: var(--accent-ink);
    border: 0;
    box-shadow: 0 4px 14px rgb(0 0 0 / 0.25);
    z-index: 12;
  }
  .toast {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    bottom: calc(70px + env(safe-area-inset-bottom));
    background: var(--ink);
    color: var(--bg);
    padding: 0.5rem 1rem;
    border-radius: 999px;
    z-index: 30;
    max-width: calc(100% - 32px);
  }
</style>
