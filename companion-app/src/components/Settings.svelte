<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { isWebhookUrl } from '../lib/discord';
  import { DEFAULT_RULES, RULESETS, findRules } from '../rules/rules';
  import { DEFAULT_DICE_COLOR, DEFAULT_DICE_INK, showDice } from '../lib/dice3d';

  const d20 = () => ({ sides: 20, value: 1 + Math.floor(Math.random() * 20), kept: true });
  function tryDice() {
    showDice({ dice: [d20(), d20()] }, app.diceColors);
  }

  // Which campaign this device plays in.
  let busy = $state(false);
  async function choose(link: string) {
    busy = true;
    try {
      if (link) await app.switchCampaign(link);
      else await app.leaveCampaign();
    } catch (e) {
      app.notify((e as Error).message);
    }
    busy = false;
  }
  async function refresh() {
    busy = true;
    try {
      await app.useCampaign(app.settings.campaign);
    } catch (e) {
      app.notify((e as Error).message);
    }
    busy = false;
  }

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
  <h3>Rules</h3>
  <select aria-label="Rules" value={findRules(app.settings.rules)?.id ?? DEFAULT_RULES}
    onchange={(e) => app.updateSettings({ rules: (e.target as HTMLSelectElement).value })}>
    {#each RULESETS as r (r.id)}<option value={r.id}>{r.name}</option>{/each}
  </select>
  <p class="small muted">What the Rules tab shows, and where new characters start.</p>
</section>

<section class="card" style="margin-top:0.75rem">
  <h3>Campaign</h3>
  <select aria-label="Campaign" value={app.campaign ? app.settings.campaign : ''} disabled={busy}
    onchange={(e) => choose((e.target as HTMLSelectElement).value)}>
    <option value="">This device</option>
    {#each Object.values(app.campaigns) as c (c.url)}<option value={c.url}>{c.campaign.name}</option>{/each}
  </select>
  {#if app.campaign}
    <p class="small muted">
      Run by {app.campaign.campaign.referee || 'your referee'}. Checked {new Date(app.campaign.fetchedAt).toLocaleDateString()}.
      <button class="link" disabled={busy} onclick={refresh}>Check for changes</button>
    </p>
  {:else}
    <p class="small muted">Your characters, maps and notes on this phone. Joining a referee's campaign arrives with sign-in.</p>
  {/if}
</section>

<section class="card" style="margin-top:0.75rem">
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
  <h3>Dice</h3>
  <label class="check small">
    <input type="checkbox" checked={app.settings.dice3d}
      onchange={(e) => app.updateSettings({ dice3d: (e.target as HTMLInputElement).checked })} />
    Roll 3D dice on screen (tap to skip to the result)
  </label>
  <div class="row dice-color">
    <label class="small">Dice <input type="color" value={app.settings.diceColor} aria-label="Dice color"
      onchange={(e) => app.updateSettings({ diceColor: (e.target as HTMLInputElement).value })} /></label>
    <label class="small">Numbers <input type="color" value={app.settings.diceInk} aria-label="Number color"
      onchange={(e) => app.updateSettings({ diceInk: (e.target as HTMLInputElement).value })} /></label>
    <span class="swatch" style:background={app.settings.diceColor} style:color={app.settings.diceInk} aria-hidden="true">20</span>
    <button onclick={tryDice} disabled={!app.settings.dice3d}>Try it</button>
    {#if app.settings.diceColor !== DEFAULT_DICE_COLOR || app.settings.diceInk !== DEFAULT_DICE_INK}
      <button class="ghost" onclick={() => app.updateSettings({ diceColor: DEFAULT_DICE_COLOR, diceInk: DEFAULT_DICE_INK })}>Reset</button>
    {/if}
  </div>
</section>

<section class="card" style="margin-top:0.75rem">
  <h3>About</h3>
  <p class="small muted">Version {__APP_VERSION__}</p>
  <p class="small">
    A companion for the Materia Mundi RPG. Characters can use the Materia Mundi Compendium (first edition) or the
    E9 System Reference Handbook; page numbers point to whichever book the character uses.
  </p>
  <p class="small muted">
    Everything stays on this device. Install it to your home screen (Share, then Add to Home Screen on iPhone) so your browser keeps your characters, and export a backup from the Party tab.
  </p>
  <p class="small muted">
    Includes material derived from the System Reference Document 5.2 by Wizards of the Coast LLC, licensed under
    <a href="https://creativecommons.org/licenses/by/4.0/legalcode">CC BY 4.0</a>. E9 rules material is from the E9
    System Reference Handbook, licensed under <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>.
  </p>
  <p class="small muted">
    Map icons and hex tiles: <a href="https://cmartins.itch.io/hex-tiles-fantasy">Hex Tiles: Fantasy</a> by cmartins, licensed under
    <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>.
  </p>
</section>

<style>
  .link { background: none; border: 0; padding: 0; min-height: 0; color: var(--accent); text-decoration: underline; font: inherit; }
  .dice-color { margin-top: 0.75rem; }
  .dice-color label { display: flex; align-items: center; gap: 0.35rem; margin: 0; }
  .swatch { display: inline-grid; place-items: center; width: 2.2rem; height: 2.2rem; border-radius: 6px; font: 700 0.95rem Georgia, serif; }
  .dice-color input[type='color'] { width: 3rem; height: 2.2rem; padding: 0.1rem; border-radius: 8px; cursor: pointer; }
</style>
