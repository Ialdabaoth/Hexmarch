<script lang="ts">
  import { app } from '../lib/app.svelte';

  let campaignUrl = $state(app.settings.campaign);
  let busy = $state(false);
  let campaignError = $state('');
  let saved = $derived(Object.values(app.campaigns).filter((c) => c.url !== app.settings.campaign));
  let customCount = $derived(app.local.items.length + app.local.magic.length);

  async function openCampaign(action: () => Promise<void>) {
    busy = true;
    campaignError = '';
    try {
      await action();
      campaignUrl = app.settings.campaign;
    } catch (e) {
      campaignError = (e as Error).message;
    }
    busy = false;
  }
</script>

<h1>Campaign</h1>

<section class="card">
  <h3>Your game</h3>
  {#if app.campaign}
    <p class="small">
      Playing in <strong>{app.campaign.campaign.name}</strong>{app.campaign.campaign.referee ? `, run by ${app.campaign.campaign.referee}` : ''}.
      New characters use its rules and equipment. Checked {new Date(app.campaign.fetchedAt).toLocaleDateString()}.
    </p>
  {:else}
    <p class="small muted">
      Playing on <strong>This device</strong>: the app's own rules and equipment, plus your custom equipment. If your referee
      gave you a campaign link, paste it here; it sets the rules and equipment for their game.
    </p>
  {/if}
  <label for="campaign">Campaign link</label>
  <input id="campaign" bind:value={campaignUrl} placeholder="https://…/campaign.json" autocapitalize="off" autocomplete="off" inputmode="url" />
  {#if campaignError}<p class="small failure">{campaignError}</p>{/if}
  <div class="row" style="margin-top:0.5rem">
    <button class="primary" disabled={busy || !campaignUrl.trim()} onclick={() => openCampaign(() => app.useCampaign(campaignUrl))}>
      {busy ? 'Opening…' : app.campaign && campaignUrl.trim() === app.settings.campaign ? 'Check for changes' : 'Use campaign'}
    </button>
    {#if app.campaign}<button disabled={busy} onclick={() => openCampaign(() => app.leaveCampaign())}>Play on This device</button>{/if}
  </div>
  {#if saved.length}
    <p class="small muted" style="margin:0.75rem 0 0.25rem">Opened before:</p>
    {#each saved as c (c.url)}
      <div class="row saved">
        <span class="grow small">{c.campaign.name}</span>
        <button disabled={busy} onclick={() => openCampaign(() => app.switchCampaign(c.url))}>Use</button>
        <button class="ghost" aria-label="Forget {c.campaign.name}" onclick={() => app.forgetCampaign(c.url)}>✕</button>
      </div>
    {/each}
  {/if}
</section>

<section class="card" style="margin-top:0.75rem">
  <h3>Custom equipment</h3>
  <p class="small muted">
    Items, spells and dweomers your referee has approved that aren't in the book. {customCount
      ? `${customCount} entr${customCount === 1 ? 'y' : 'ies'} on this device.`
      : 'None yet.'}
  </p>
  <button onclick={() => (app.view = { name: 'equipment' })}>Edit custom equipment</button>
</section>

<section class="card" style="margin-top:0.75rem">
  <h3>Running a game</h3>
  <p class="small muted">
    Referees: pick the rules, add your custom equipment, then publish it as a campaign. You get two files to put online;
    players paste the link to <code>campaign.json</code> above.
  </p>
  <button onclick={() => (app.view = { name: 'equipment', publish: true })}>Publish as campaign</button>
</section>

<style>
  .saved { align-items: center; flex-wrap: nowrap; }
</style>
