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
  <h3>About</h3>
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
