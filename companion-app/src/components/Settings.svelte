<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { isWebhookUrl } from '../lib/discord';

  let url = $state(app.settings.webhookUrl);
  let valid = $derived(!url.trim() || isWebhookUrl(url));

  async function saveUrl() {
    if (!valid) return;
    await app.updateSettings({ webhookUrl: url.trim() });
    app.notify(url.trim() ? 'Webhook saved' : 'Webhook removed');
  }

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

  async function test() {
    await app.post({
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      who: 'Materia Mundi',
      label: 'Test roll',
      detail: 'The companion app is connected.',
      total: 20,
      outcome: 'success'
    });
  }
</script>

<h1>Settings</h1>

<section class="card">
  <h3>Discord</h3>
  <p class="small muted">
    In Discord, open your channel's settings, then Integrations, Webhooks, New Webhook, and Copy Webhook URL. Paste it here.
    Anyone with this link can post to that channel, so keep it to your group.
  </p>
  <label for="hook">Webhook URL</label>
  <input id="hook" bind:value={url} placeholder="https://discord.com/api/webhooks/…" autocapitalize="off" autocomplete="off" />
  {#if !valid}<p class="small failure">That doesn't look like a Discord webhook URL.</p>{/if}
  <div class="row" style="margin-top:0.5rem">
    <button class="primary" onclick={saveUrl} disabled={!valid}>Save</button>
    <button onclick={test} disabled={!app.canPost}>Send test</button>
  </div>
  <label class="check small" style="margin-top:0.75rem">
    <input type="checkbox" checked={app.settings.autoPost} disabled={!app.canPost}
      onchange={(e) => app.updateSettings({ autoPost: (e.target as HTMLInputElement).checked })} />
    Post every roll to Discord automatically
  </label>
</section>

<section class="card" style="margin-top:0.75rem">
  <h3>Campaign</h3>
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
      : 'None yet.'} Referees can publish theirs as a campaign.
  </p>
  <button onclick={() => (app.view = { name: 'equipment' })}>Edit custom equipment</button>
</section>

<section class="card" style="margin-top:0.75rem">
  <h3>Dice</h3>
  <label class="check small">
    <input type="checkbox" checked={app.settings.dice3d}
      onchange={(e) => app.updateSettings({ dice3d: (e.target as HTMLInputElement).checked })} />
    Roll 3D dice on screen (tap to skip to the result)
  </label>
</section>

<section class="card" style="margin-top:0.75rem">
  <h3>About</h3>
  <p class="small muted">Version {__APP_VERSION__}</p>
  <p class="small">
    A companion for the Materia Mundi RPG. Characters can use the Materia Mundi Compendium (first edition) or the
    E9 System Reference Handbook; page numbers point to whichever book the character uses.
  </p>
  <p class="small muted">
    Everything stays on this device. Install it to your home screen (Share, then Add to Home Screen on iPhone) so your browser keeps your characters, and export a backup from the Characters tab.
  </p>
  <p class="small muted">
    Includes material derived from the System Reference Document 5.2 by Wizards of the Coast LLC, licensed under
    <a href="https://creativecommons.org/licenses/by/4.0/legalcode">CC BY 4.0</a>. E9 rules material is from the E9
    System Reference Handbook, licensed under <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>.
  </p>
</section>

<style>
  .saved { align-items: center; flex-wrap: nowrap; }
</style>
