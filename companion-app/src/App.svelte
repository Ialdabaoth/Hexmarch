<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from './lib/app.svelte';
  import { requestPersistence } from './lib/storage';
  import Home from './components/Home.svelte';
  import Builder from './components/Builder.svelte';
  import Sheet from './components/Sheet.svelte';
  import Dice from './components/Dice.svelte';
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
    { name: 'list', label: 'Characters' },
    { name: 'campaign', label: 'Campaign' },
    { name: 'dice', label: 'Dice' },
    { name: 'settings', label: 'Settings' }
  ] as const;

  let active = $derived(['build', 'sheet', 'render'].includes(app.view.name) ? 'list' : app.view.name === 'equipment' ? 'campaign' : app.view.name);
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
  {:else if app.view.name === 'dice'}
    <Dice />
  {:else if app.view.name === 'settings'}
    <Settings />
  {:else if app.view.name === 'campaign'}
    <Campaign />
  {:else if app.view.name === 'equipment'}
    <CustomEquipment publishing={app.view.publish} />
  {/if}
</main>

<RollResult />
<HoldMenu />

{#if app.toast}
  <div class="toast no-print" role="status">{app.toast}</div>
{/if}

<nav class="no-print">
  {#each tabs as t}
    <button class:on={active === t.name} onclick={() => (app.view = { name: t.name })}>{t.label}</button>
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
