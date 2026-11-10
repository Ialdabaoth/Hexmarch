<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { isWebhookUrl } from '../lib/discord';
  import { DEFAULT_RULES, RULESETS, findRules } from '../rules/rules';
  import { DEFAULT_DICE_COLOR, DEFAULT_DICE_INK, showDice } from '../lib/dice3d';
  import { inviteLink, readInvite, invitationLabel, type Role } from '../lib/invitations';
  import { isScribeLink } from '../lib/campaign';

  const d20 = () => ({ sides: 20, value: 1 + Math.floor(Math.random() * 20), kept: true });
  function tryDice() {
    showDice({ dice: [d20(), d20()] }, app.diceColors);
  }

  // Which campaign this device plays in, and in which seat: one entry per invitation, as referee or as a player.
  // The seat sets the mode (Heph 2026-11-09).
  let busy = $state(false);
  async function run(f: () => Promise<unknown>) {
    busy = true;
    try {
      await f();
    } catch (e) {
      app.notify((e as Error).message);
    }
    busy = false;
  }
  const choose = (id: string) => run(() => (id ? app.chooseInvitation(id) : app.leaveCampaign()));
  const refresh = () => run(() => app.checkCampaign());

  function label(s: (typeof app.invitations)[number]): string {
    const name = app.campaigns[s.url]?.campaign.name ?? s.name ?? s.url;
    return invitationLabel(s, name, s.character ? app.character(s.character)?.name : undefined);
  }
  let invitations = $derived(app.invitations.slice().sort((a, b) => label(a).localeCompare(label(b))));

  // Until invitations arrive by sign-in, an invitation is a link, pasted here or opened.
  let joinUrl = $state('');
  let joinRole = $state<Role>('player');
  // A pasted invitation link names its own seat; a plain campaign link takes the one picked here.
  function invitation(text: string) {
    try {
      const u = new URL(text);
      if (u.searchParams.has('campaign')) return readInvite(u.search);
    } catch {
      // not a link with an invitation in it
    }
    return null;
  }
  const join = () => run(async () => {
    const i = invitation(joinUrl.trim());
    await app.useCampaign(i?.url ?? joinUrl.trim(), i?.role ?? joinRole, i?.character, i?.party);
    joinUrl = '';
  });

  // The referee's invitation link for a player: the campaign, the party they join (Heph 2026-11-10: invitations are
  // to a party) and, optionally, the character they play.
  let inviteFor = $state('');
  let inviteTo = $state('');
  // Handed here by the Atlas's party builder: that party's invitation, open and in view.
  let inviteOpen = $state(false);
  let inviteBox = $state<HTMLDetailsElement>();
  $effect(() => {
    const v = app.view;
    if (v.name !== 'settings' || !v.invite) return;
    inviteTo = v.invite;
    inviteOpen = true;
    app.view = { name: 'settings' };
    queueMicrotask(() => inviteBox?.scrollIntoView({ block: 'start' }));
  });
  let toParty = $derived(app.state.parties.some((p) => p.id === inviteTo) ? inviteTo : app.state.active);
  let invite = $derived(
    app.campaign
      ? inviteLink(location.origin + location.pathname, {
          url: app.campaign.published?.pointer ?? app.settings.campaign, role: 'player',
          ...(toParty ? { party: toParty } : {}), ...(inviteFor ? { character: inviteFor } : {})
        })
      : ''
  );
  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(invite);
      app.notify('Invitation link copied');
    } catch {
      app.notify("Couldn't copy; select the link and copy it instead");
    }
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
      who: `${__SUITE_NAME__} Companion`,
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
  <select aria-label="Campaign" value={app.invitation ? app.invitation.id : ''} disabled={busy}
    onchange={(e) => choose((e.target as HTMLSelectElement).value)}>
    <option value="">This device · Referee</option>
    {#each invitations as s (s.id)}<option value={s.id}>{label(s)}</option>{/each}
  </select>
  {#if app.campaign}
    <p class="small muted">
      {app.mode === 'player' ? 'Player mode: your character, your party and what your character knows.' : 'Referee mode: everything in the campaign.'}
      Run by {app.campaign.campaign.referee || 'your referee'}. Checked {new Date(app.campaign.fetchedAt).toLocaleDateString()}.
      <button class="link" disabled={busy} onclick={refresh}>Check for changes</button>
      {#if app.invitation}<button class="link" disabled={busy} onclick={() => app.invitation && run(() => app.forgetInvitation(app.invitation!.id))}>Remove from this device</button>{/if}
    </p>
    {#if app.mode === 'referee' && app.canUpdate}
      <p class="small muted">
        Published{app.campaign.published ? ` (update ${app.campaign.published.revision})` : ''}. <button class="link" disabled={busy} onclick={() => run(() => app.updateCampaign())}>Update campaign</button>
        saves the campaign as players will see it now (the clock, the party, what each character knows, and the requests you answered) as two files to upload in place of the old ones.
      </p>
    {/if}
    {#if app.mode === 'referee' && isScribeLink(app.settings.campaign)}
      <p class="small muted">
        <button class="link" disabled={busy} onclick={() => run(async () => { location.href = await app.scribeLink(); })}>Send play to Scribe</button>
        opens Scribe with the clock, the party, what each character knows and the requests you answered, so its Publish includes them.
      </p>
    {/if}
    {#if app.mode === 'referee'}
      <details bind:open={inviteOpen} bind:this={inviteBox}>
        <summary class="small">Invite a player</summary>
        {#if isScribeLink(app.settings.campaign) && !app.campaign.published}
          <p class="small muted">This campaign is kept only on this device, where Scribe saved it, so a player can't open it yet. Invitations open once the campaign is published.</p>
        {:else}
        <p class="small muted">Send this link to a player. Opening it adds the campaign to their switcher in player mode.</p>
        {#if !app.state.parties.length}
          <p class="small muted">Make a party first (Maps › the Atlas's Party › New party): every invitation is to a party.</p>
        {:else}
        <select aria-label="Party the player joins" value={toParty} onchange={(e) => (inviteTo = (e.target as HTMLSelectElement).value)}>
          {#each app.state.parties as p (p.id)}<option value={p.id}>To join {p.name}</option>{/each}
        </select>
        <select aria-label="Character the player plays" bind:value={inviteFor}>
          <option value="">They pick or make a character</option>
          {#each app.characters.filter((c) => c.data.owner !== 'referee') as c (c.id)}<option value={c.id}>To play {c.name}</option>{/each}
        </select>
        <input readonly value={invite} aria-label="Invitation link" onfocus={(e) => (e.target as HTMLInputElement).select()} />
        <button onclick={copyInvite}>Copy link</button>
        {/if}
        {/if}
      </details>
    {/if}
  {:else}
    <p class="small muted">Your characters, maps and notes on this phone, in referee mode.</p>
  {/if}
  <details>
    <summary class="small">Add a campaign</summary>
    <label for="join">Campaign or invitation link</label>
    <input id="join" bind:value={joinUrl} placeholder="https://…/campaign.json" autocapitalize="off" autocomplete="off" />
    <div class="row" style="margin-top:0.5rem">
      <label class="check small"><input type="radio" bind:group={joinRole} value="player" /> As a player</label>
      <label class="check small"><input type="radio" bind:group={joinRole} value="referee" /> As the referee</label>
      <button class="primary" disabled={busy || !joinUrl.trim()} onclick={join}>Add</button>
    </div>
  </details>
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
  <p class="small muted">{__SUITE_NAME__} Companion, version {__APP_VERSION__}</p>
  {#if __PATREON_URL__}
    <p class="small">Enjoying E9? <a href={__PATREON_URL__} target="_blank" rel="noopener">Support it on Patreon</a> for new modules every month.</p>
  {/if}
  <p class="small">
    A companion for OSR hexcrawl games: E9 and its settings so far. Characters can use the Materia Mundi Compendium (first edition, a setting
    within E9) or the E9 System Reference Handbook; page numbers point to whichever book the character uses.
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
