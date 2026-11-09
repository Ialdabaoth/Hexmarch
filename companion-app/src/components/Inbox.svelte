<script lang="ts">
  // Requests and replies for the campaign in use (WORKFLOWS.md "Invitations"). Without a mailbox service a
  // request arrives as a file: open it here.
  import { app } from '../lib/app.svelte';
  import { requestStatus } from '../../../engine/mail';

  let fileInput = $state<HTMLInputElement>();
  let notes = $state<Record<string, string>>({});
  let returning = $state<string | null>(null);
  let busy = $state(false);

  async function run(f: () => Promise<unknown>) {
    busy = true;
    try {
      await f();
    } catch (e) {
      app.notify((e as Error).message);
    } finally {
      busy = false;
    }
  }

  async function onFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    await run(async () => {
      let data: unknown;
      try {
        data = JSON.parse(await file.text());
      } catch {
        throw new Error("That file isn't a message");
      }
      const n = await app.openMail(data);
      app.notify(n === 1 ? 'Added to the Inbox' : `Added ${n} messages to the Inbox`);
    });
  }

  const charName = (sheet: unknown) => ((sheet as { flavor?: { name?: unknown }; name?: unknown })?.flavor?.name ?? (sheet as { name?: unknown })?.name ?? 'A character') as string;
  const when = (iso: string) => (iso ? new Date(iso).toLocaleString() : '');
  const STATUS = { sent: 'Sent', received: 'Received by the referee', live: 'Approved: in the party', 'sent-back': 'Sent back' } as const;

  let snap = $derived(app.campaign?.published?.snapshot ?? null);
  let mine = $derived(app.requests.filter((m) => m.box === 'out' && m.envelope.kind === 'join'));
  let incoming = $derived(app.requests.filter((m) => m.box === 'in'));
</script>

<h1>Inbox</h1>

{#if !app.campaign}
  <section class="card">
    <p>Nothing waiting.</p>
    <p class="small muted">Requests and replies arrive here once you play in or run a shared campaign. Pick one in Settings.</p>
  </section>
{:else}
  {#if app.mode === 'referee'}
    {#each incoming as m (m.envelope.id)}
      <section class="card request">
        <p><strong>{m.envelope.from.name || 'A player'}</strong> asks to join with <strong>{charName(m.envelope.body.character)}</strong>.</p>
        <p class="small muted">Sent {when(m.envelope.sent)}</p>
        {#if m.answer?.kind === 'approved'}
          <p class="small">Approved {when(m.answer.at)}. {app.receipts.includes(m.envelope.id) ? 'The next Update campaign tells the player.' : ''}</p>
        {:else if m.answer?.kind === 'sent-back'}
          <p class="small">Sent back {when(m.answer.at)}: “{m.answer.note}”</p>
        {:else if returning === m.envelope.id}
          <textarea rows="3" placeholder="A note for the player: what to change" bind:value={notes[m.envelope.id]}></textarea>
          <div class="row">
            <button class="primary" disabled={busy || !notes[m.envelope.id]?.trim()} onclick={() => run(async () => { await app.sendBackRequest(m.envelope.id, notes[m.envelope.id]); returning = null; })}>Send back</button>
            <button onclick={() => (returning = null)}>Cancel</button>
          </div>
        {:else}
          <div class="row">
            <button class="primary" disabled={busy} onclick={() => run(() => app.approve(m.envelope.id))}>Approve</button>
            <button disabled={busy} onclick={() => (returning = m.envelope.id)}>Send back</button>
          </div>
        {/if}
      </section>
    {:else}
      <section class="card">
        <p>Nothing waiting.</p>
        <p class="small muted">A player's request to join arrives as a file when the campaign has no mailbox. Open it below.</p>
      </section>
    {/each}
  {:else}
    {#each incoming as m (m.envelope.id)}
      <section class="card request">
        <p><strong>The referee sent your request back.</strong></p>
        <p>“{m.envelope.body.note}”</p>
        <p class="small muted">{when(m.envelope.sent)}. Change your character, then send it again from the Character screen.</p>
      </section>
    {/each}
    {#each mine as m (m.envelope.id)}
      {@const status = requestStatus(m.envelope, snap, incoming.some((x) => x.envelope.re === m.envelope.id))}
      <section class="card request">
        <p>Request to join with <strong>{charName(m.envelope.body.character)}</strong></p>
        <p class="small muted">Sent {when(m.envelope.sent)} · <strong>{STATUS[status]}</strong></p>
      </section>
    {:else}
      {#if !incoming.length}
        <section class="card">
          <p>Nothing waiting.</p>
          <p class="small muted">Once you send your character to the referee, you can follow the request here.</p>
        </section>
      {/if}
    {/each}
  {/if}
  <p class="small muted">
    <button class="link" onclick={() => fileInput?.click()}>Open a message file…</button>
    {app.mode === 'referee' ? "A player's request, sent to you as a file." : "The referee's reply, sent to you as a file."}
  </p>
  <input bind:this={fileInput} type="file" accept="application/json,.json" hidden onchange={onFile} />
{/if}

<style>
  .request p { margin: 0.2rem 0; }
  .request .row { margin-top: 0.5rem; }
  textarea { width: 100%; margin-top: 0.5rem; }
</style>
