<script lang="ts">
  import { ROOTS, RULES_MANIFESTS, type RootChoice } from './lib/rules';
  import { loadSite, type SiteModule } from './lib/data';
  import { buildCampaign, describeProblem, startsOf, type Built, type Choices } from './lib/campaign';
  import { applyUpdate, backUrl, campaignMessage, playFor, publishAgain, publishedMessage, type PublishResult, publishOnDevice, savePlayState, publishSecret, saveOnDevice, savePublishSecret, savedCampaign, testUpload, type SavedCampaign, type UpdateResult } from './lib/device';
  import { applyAtlas, atlasEvent, type State } from './lib/parties';
  import type { UploadCheck, UploadReport } from '../../engine';
  import { appsScriptCode, appsScriptStore, githubStore, messageLink, newKey, readMessageHash, servicesFor, staticServices, upload, type Services, type StoreKind } from '../../engine';

  const VERSION = __SCRIBE_VERSION__;
  const params = new URLSearchParams(location.search);
  const DRAFT = 'hexmarch-scribe-draft';

  interface Draft {
    title: string;
    root: string; // "<module>/<option>"
    modules: string[];
  }
  const blank: Draft = { title: '', root: '', modules: [] };
  function loadDraft(): Draft {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT) ?? 'null');
      return d ? { title: String(d.title ?? ''), root: String(d.root ?? ''), modules: Array.isArray(d.modules) ? d.modules : [] } : structuredClone(blank);
    } catch {
      return structuredClone(blank);
    }
  }

  let draft = $state<Draft>(loadDraft());
  let siteUrl = $state(params.get('site') || __DATA_URL__);
  let site = $state<SiteModule[]>([]);
  let siteError = $state('');
  let loading = $state(false);
  let built = $state<Built | null>(null);

  const rootKey = (r: RootChoice) => `${r.module}/${r.option}`;
  const root = $derived(ROOTS.find((r) => rootKey(r) === draft.root) ?? null);
  const picked = $derived(site.filter((m) => draft.modules.includes(m.id)));

  async function refresh() {
    if (!siteUrl) return;
    loading = true;
    siteError = '';
    try {
      site = await loadSite(siteUrl);
      if (!site.length) siteError = 'That site lists no modules Scribe can read.';
    } catch (e) {
      siteError = (e as Error).message;
      site = [];
    }
    loading = false;
  }
  refresh();

  $effect(() => {
    try {
      localStorage.setItem(DRAFT, JSON.stringify(draft));
    } catch {
      // private window: the draft just isn't kept
    }
  });

  $effect(() => {
    const d = $state.snapshot(draft);
    if (!root || !d.modules.length) {
      built = null;
      return;
    }
    const choices: Choices = { title: d.title, root, modules: d.modules };
    buildCampaign(choices, $state.snapshot(site) as SiteModule[], RULES_MANIFESTS).then((b) => (built = b));
  });

  function toggle(id: string) {
    draft.modules = draft.modules.includes(id) ? draft.modules.filter((m) => m !== id) : [...draft.modules, id];
  }

  function download(name: string, data: unknown) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1) + '\n'], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Preview in Atlas opens the first picked module at its first start's place, when it has one.
  const startSite = $derived.by(() => {
    if (!built || !picked.length) return null;
    const m = picked[0];
    const first = startsOf(m)[0];
    const name = first?.site ?? '';
    return { module: m.id, slug: m.sites.find((x) => x.name === name)?.slug ?? '' };
  });

  // Step 7: save the campaign on this device and open it in the Companion (by link) or the Atlas.
  let saveError = $state('');
  let savedAs = $state('');
  let wroteState = false;
  async function save(): Promise<string | null> {
    if (!built || !root || built.problems.length) return null;
    saveError = '';
    const title = String(built.manifest.title);
    try {
      const saved = await saveOnDevice($state.snapshot(built) as Built, root, siteUrl, (rev) =>
        confirm(`This device already has play for “${title}” (state revision ${rev}): where the party is, the clock and what it has found. Start it again from scratch (no parties yet)?\n\nOK starts again; Cancel keeps the play and saves only the campaign.`)
      );
      wroteState = saved.wroteState;
      savedAs = saved.link;
      return savedAs;
    } catch (e) {
      saveError = `Scribe couldn't save on this device: ${(e as Error).message || e}. A private window may not allow it; download the files instead.`;
      return null;
    }
  }
  let building = $state(false);
  async function build() {
    building = true;
    await save();
    building = false;
  }

  // Steps 8 and 9: Services and Publish (SCRIBE.md section 5).
  let record = $state<SavedCampaign | null>(null);
  let folder = $state('');
  let postUrl = $state('');
  // Where Publish puts the files (Scribe 0.6: adapters): the referee's own GitHub repo (preferred, Heph 2026-11-10),
  // Google Drive through their own Apps Script, or by hand as before.
  let storeKind = $state<StoreKind>('github');
  let scriptUrl = $state('');
  // Repository = the referee's GitHub username / the repository name (step 2 suggests one from the campaign name).
  let ghUser = $state('');
  let ghName = $state('');
  const ghRepo = $derived(ghUser.trim() && ghName.trim() ? `${ghUser.trim()}/${ghName.trim()}` : '');
  const suggestedName = $derived(
    (built ? String(built.manifest.title) : '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'my-campaign'
  );
  $effect(() => {
    if (storeKind === 'github' && !ghName && built) ghName = suggestedName;
  });
  const newRepoLink = $derived(`https://github.com/new?${new URLSearchParams({ name: ghName.trim() || suggestedName, visibility: 'public', description: 'Hexmarch campaign files' })}`);
  const tokenLink = $derived(
    `https://github.com/settings/personal-access-tokens/new?${new URLSearchParams({
      name: `Hexmarch Scribe ${ghName.trim() || suggestedName}`.slice(0, 40),
      description: 'Lets Hexmarch Scribe publish this campaign',
      ...(ghUser.trim() ? { target_name: ghUser.trim() } : {}),
      contents: 'write'
    })}`
  );
  let ghDir = $state('');
  let ghBranch = $state('main');
  let secret = $state('');
  let scriptKey = $state(newKey()); // only for a script not set up yet
  let copied = $state(false);
  function services(): Services {
    if (storeKind === 'manual') return staticServices(folder, postUrl);
    return servicesFor(storeKind === 'github' ? githubStore(ghRepo, ghDir, ghBranch) : appsScriptStore(scriptUrl), postUrl);
  }
  const storeReady = $derived(storeKind === 'manual' ? !!folder : storeKind === 'github' ? !!ghRepo && !!secret : !!scriptUrl && !!secret);
  async function copyScript() {
    try {
      await navigator.clipboard.writeText(appsScriptCode(scriptKey));
      secret = scriptKey;
      copied = true;
    } catch {
      copied = false;
    }
  }
  let publishError = $state('');
  let justPublished = $state(false);
  const campaignKey = $derived(built ? String(built.manifest.id) : '');
  $effect(() => {
    const id = campaignKey;
    void savedAs; // read the record again after every save
    if (!id) return;
    savedCampaign(id).then((r) => {
      record = r;
      if (r?.services && !folder) {
        folder = r.services.folder;
        postUrl = r.services.post;
        const st = r.services.store;
        storeKind = st?.kind ?? 'manual';
        if (st?.kind === 'apps-script') scriptUrl = st.url;
        if (st?.kind === 'github') {
          ghUser = st.owner;
          ghName = st.repo;
          ghDir = st.dir;
          ghBranch = st.branch;
        }
      }
      if (r) publishSecret(id).then((v) => v && (secret = v));
    }).catch(() => (record = null));
  });
  async function publish() {
    publishError = '';
    justPublished = false;
    try {
      const sv = services();
      if (sv.store && sv.store.kind !== 'manual') await savePublishSecret(campaignKey, secret);
      publishing = true;
      const out = await publishOnDevice(campaignKey, sv, new Date(), (f) =>
        upload(sv.store ?? { kind: 'manual', folder: sv.folder }, secret, { 'campaign.json': f.pointer, 'snapshot.json': f.snapshot }, `Publish ${String(record?.manifest.title ?? campaignKey)}, revision ${f.snapshot.revision}`)
      );
      record = out.record;
      folder = sv.folder;
      if (!sv.store || sv.store.kind === 'manual') {
        download('campaign.json', out.pointer);
        download('snapshot.json', out.snapshot);
      }
      justPublished = true;
    } catch (e) {
      publishError = (e as Error).message;
    }
    publishing = false;
  }
  let publishing = $state(false);

  // Test (Heph 2026-11-09): is the folder serving what the last publish produced?
  let testing = $state(false);
  let test = $state<UploadReport | null | 'none' | string>(null);
  async function runTest() {
    testing = true;
    test = null;
    try {
      test = (await testUpload(campaignKey, services())) ?? 'none';
    } catch (e) {
      test = (e as Error).message;
    }
    testing = false;
  }
  const SAYS: Record<UploadCheck, string> = {
    matches: 'matches what you published',
    missing: "isn't there yet (a new upload can take a few minutes to appear)",
    older: 'is there, but an older one: upload the new file',
    different: "is there, but isn't the file you published: upload it again",
    unreadable: "can't be read: it isn't JSON, or the host doesn't let other sites read it"
  };

  // Auto-publish (Heph 2026-11-10: Scribe is the only publisher, and the referee shouldn't bounce back and forth). The
  // first publish stays the Publish button; after it, parties made, moved or picked in the embedded Atlas are published
  // a few seconds later, and an invitation waits for any publish still pending, so the player joins a campaign that
  // already has their party.
  const AUTO_DELAY = 3000;
  let autoTimer: ReturnType<typeof setTimeout> | undefined;
  let autoRun: Promise<PublishResult> | null = null;
  let autoStatus = $state<'publishing' | PublishResult | null>(null);
  function schedulePublish() {
    if (!record?.published) return;
    clearTimeout(autoTimer);
    autoTimer = setTimeout(() => void publishNow(), AUTO_DELAY);
  }
  async function runPublish(id: string): Promise<PublishResult> {
    autoStatus = 'publishing';
    const r = await publishAgain(id);
    autoStatus = r;
    if (id === campaignKey) record = await savedCampaign(id);
    return r;
  }
  // Runs a pending auto-publish now, or waits for one under way; false when that publish failed.
  async function publishNow(): Promise<boolean> {
    if (autoTimer !== undefined) {
      clearTimeout(autoTimer);
      autoTimer = undefined;
      const before = autoRun;
      autoRun = (async () => (await before, runPublish(campaignKey)))().finally(() => (autoRun = null));
    }
    const r = autoRun ? await autoRun : null;
    return !r || r.ok;
  }

  // Update in Scribe (Companion -> Scribe, a link to scribe/#m=...): play to publish from.
  let received = $state<UpdateResult | null>(null);
  let receiveError = $state('');
  (async () => {
    try {
      const e = await readMessageHash(location.hash);
      if (!e) return;
      received = await applyUpdate(e);
      history.replaceState(null, '', location.pathname + location.search);
      // Scribe is the only publisher: an Update from the Companion is published straight away (after the first
      // Publish), then the Companion gets the answer at its back address.
      const rec = await savedCampaign(e.campaign);
      const result: PublishResult =
        received.status === 'applied' ? await runPublish(e.campaign)
        : rec?.published ? { ok: true, revision: rec.published.revision, at: rec.published.at }
        : { ok: false, firstPublish: true, error: 'Publish the campaign once in Scribe first.' };
      autoStatus = result;
      // back (the Companion): return with a 'published' message, whatever happened. return (the Atlas): a page to open
      // as it is, e.g. the Companion's invite link, only once publishing worked. Both only on this site.
      const back = backUrl(e.body.back, location.href);
      const onward = backUrl(e.body.return, location.href);
      if (back) location.href = await messageLink(back, publishedMessage(e.campaign, e.id, result));
      else if (onward && result.ok) location.href = onward;
    } catch (e) {
      receiveError = `Scribe couldn't read that link: ${(e as Error).message || e}`;
    }
  })();

  // Built = this device holds the campaign exactly as the page shows it now (Heph 2026-11-10: Build Campaign first,
  // then Open in the Companion or the Atlas). Changing the campaign after building asks for another build.
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const isBuilt = $derived(!!built && !!record && same(record.manifest, $state.snapshot(built.manifest)) && same(record.lock, $state.snapshot(built.lock)));

  async function previewAtlas() {
    if (!isBuilt || !built || !startSite) return;
    play = (await playFor(campaignKey)).state as State;
    atlasShown = true;
    setAtlasOpen(true);
  }

  // An invitation, from the embedded Atlas's party builder (Heph 2026-11-10: Scribe sets up the campaign and hands it to
  // the Atlas; the Atlas builds the party; the party builder hands to the Companion per invite, so there is no Preview
  // in Companion button). Apps talk by links: the Companion gets the campaign, Scribe's play state with that party
  // active, and `invite: {party}` so it opens Invite a player for that party.
  async function invite(party: string) {
    if (!(await publishNow())) return; // shown above the Atlas; the player would join a campaign without their party
    const rec = built && (await savedCampaign(String(built.manifest.id)));
    if (!rec || !play) return;
    const state = applyAtlas($state.snapshot(play) as State, { event: 'active', module: '', party }, siteUrl);
    location.href = await messageLink(new URL('../', location.href).href, campaignMessage(rec, state, { party }));
  }

  // Preview in Atlas (Heph 2026-11-10): the Atlas embedded here, as in the Companion's Campaign › Maps, in a header
  // that folds (open or closed is remembered on this device). Scribe is its host: it hands the Atlas the play state
  // and the lockfile (whose starts the party creator offers) and applies the parties made, moved or picked there to
  // its own copy, which Publish reads. A folded Atlas stays loaded, so its messages keep coming.
  const ATLAS_OPEN = 'hexmarch-scribe-atlas-open';
  let atlasShown = $state(false);
  let atlasOpen = $state(true);
  try {
    atlasOpen = localStorage.getItem(ATLAS_OPEN) !== '0';
  } catch {
    // storage blocked: start open
  }
  function setAtlasOpen(open: boolean) {
    atlasOpen = open;
    try {
      localStorage.setItem(ATLAS_OPEN, open ? '1' : '0');
    } catch {
      // not kept
    }
  }
  let play = $state<State | null>(null);
  let frame = $state<HTMLIFrameElement>();
  const atlasSrc = $derived(
    startSite ? `../atlas/?module=${encodeURIComponent(startSite.module)}&site=${encodeURIComponent(siteUrl)}${startSite.slug ? `#site:${startSite.slug}` : ''}` : ''
  );
  const postAtlas = (msg: object) => frame?.contentWindow?.postMessage({ type: 'hexmarch-atlas', ...msg }, '*');
  function sendAtlas() {
    if (play) postAtlas({ state: $state.snapshot(play) });
    if (built) postAtlas({ lock: $state.snapshot(built.lock) });
    // the party builder's Invite button sends {event:'invite'} only when its host offers it
    postAtlas({ hostActions: ['invite'], ...(record?.services?.pointer ? { campaign: record.services.pointer } : {}) });
  }
  // The Atlas may still be loading its map when the frame loads, so both go again when it first reports its view.
  let greeted = false;
  function onAtlasLoad() {
    greeted = false;
    sendAtlas();
  }
  async function onAtlasMessage(e: MessageEvent) {
    if (!frame || e.source !== frame.contentWindow || !play) return;
    const ev = atlasEvent(e.data);
    if (!ev) return;
    if (ev.event === 'invite') return invite(ev.party);
    if (ev.event === 'view') {
      if (!greeted) {
        greeted = true;
        sendAtlas();
      }
      return;
    }
    const next = applyAtlas($state.snapshot(play) as State, ev, siteUrl);
    if (next.revision === play.revision) return;
    play = next;
    await savePlayState(campaignKey, next);
    postAtlas({ state: next });
    schedulePublish();
  }
</script>

<svelte:window onmessage={onAtlasMessage} />

<main>
  <header>
    <img src="icon.svg" alt="" />
    <div>
      <h1>⬢ Scribe</h1>
      <div class="small muted">New campaign · {__SITE_NAME__} Scribe {VERSION}</div>
    </div>
  </header>

  {#if received}
    <section class="small">
      {#if received.status === 'applied'}Received play for “{received.title ?? received.campaign}” from the Companion (state revision {received.revision}).
        {#if autoStatus === 'publishing'} Publishing…{:else if autoStatus?.ok} Published (revision {autoStatus.revision}).{:else if autoStatus} {autoStatus.error}{/if}
      {:else if received.status === 'older'}That link holds older play for “{received.title ?? received.campaign}” (revision {received.revision}) than Scribe already has, so Scribe kept what it has.
      {:else}Scribe already has the play in that link.{/if}
      {#if !received.title} Scribe hasn't saved this campaign on this device; open it in Scribe to publish.{/if}
    </section>
  {/if}
  {#if receiveError}<p class="bad">{receiveError}</p>{/if}

  <section>
    <h2>Campaign</h2>
    <input type="text" bind:value={draft.title} placeholder="Kells, 1422" />
    <h3><button type="button" class="tip" data-tip="A campaign plays one set of core rules. Everything else is added on top.">Core Rules</button></h3>
    {#each ROOTS as r (rootKey(r))}
      <label class="opt">
        <input type="radio" name="root" value={rootKey(r)} bind:group={draft.root} />
        <span><strong>{r.title}</strong> <span class="small muted">{r.module} {r.version}</span></span>
      </label>
    {/each}
  </section>

  {#if root}
  <section>
    <h2>Modules</h2>
    {#if loading}
      <p class="muted">Reading the modules…</p>
    {:else if siteError}
      <p class="bad">{siteError}</p>
    {/if}
    {#each site as m (m.id)}
      <label class="opt">
        <input type="checkbox" checked={draft.modules.includes(m.id)} onchange={() => toggle(m.id)} />
        <span>
          <strong>{m.title}</strong> <span class="small muted">{m.version}</span>
          {#if m.books.length}<br /><span class="small muted">{m.books.map((b) => `${b.id} ${b.title}`).join(' · ')}</span>{/if}
        </span>
      </label>
      {#if startsOf(m).length}
        <details class="starts">
          <summary>Show Player Start Locations</summary>
          <ul>
            {#each startsOf(m) as st (st.id)}
              <li><strong>{st.title ?? st.id}</strong>
                <span class="small muted">{[st.site, st.date, st.levels ? `levels ${st.levels[0]}–${st.levels[1]}` : '', st.uses?.length ? `plays ${st.uses.join(', ')}` : ''].filter(Boolean).join(' · ')}</span></li>
            {/each}
          </ul>
        </details>
      {/if}
    {/each}
    <details class="small">
      <summary class="muted">Modules from another site</summary>
      <div class="row">
        <input type="url" bind:value={siteUrl} />
        <button class="quiet" onclick={refresh}>Read</button>
      </div>
    </details>
  </section>

  {/if}

  {#if built}
    <section>
      <h2><button type="button" class="tip" data-tip="The campaign stays on this device: the Companion, the Atlas and Scribe share it here. The Atlas puts the party at the start the first time it opens.">Your campaign</button></h2>
      {#if built.problems.length}
        <p class="bad">Scribe can't settle the modules yet:</p>
        <ul class="problems">{#each built.problems as p}<li>{describeProblem(p)}</li>{/each}</ul>
      {:else}
        <p class="small muted">{built.lock.modules.map((m) => `${m.id} ${m.version}`).join(' · ')}</p>
      {/if}
      <button disabled={!!built.problems.length || building} onclick={build}>{building ? 'Building…' : 'Build Campaign'}</button>
      {#if saveError}<p class="bad">{saveError}</p>{/if}
      {#if !isBuilt && record}
        <p class="small muted">The campaign has changed since you built it. Build it again to open or publish it.</p>
      {/if}
      {#if isBuilt}
      <details class="files">
        <summary><span class="tip" data-tip="Keep these three files together to back up the campaign or move it to another device.">Campaign Files</span></summary>
        <ul>
          <li><a href="#module.json" onclick={(e) => (e.preventDefault(), download('module.json', built!.manifest))}>module.json</a></li>
          <li><a href="#campaign.lock.json" onclick={(e) => (e.preventDefault(), download('campaign.lock.json', built!.lock))}>campaign.lock.json</a></li>
          <li><a href="#state.json" onclick={(e) => (e.preventDefault(), download('state.json', built!.state))}>state.json</a></li>
        </ul>
      </details>
      {/if}
    </section>
  {/if}

  {#if built && isBuilt}
    <section>
      <h2>Preview My Campaign</h2>
      <div class="row">
        {#if startSite && !atlasShown}<button onclick={previewAtlas}>Preview in Atlas</button>{/if}
      </div>
      {#if atlasShown && atlasSrc}
        {#if autoStatus === 'publishing'}<p class="small muted">Publishing…</p>
        {:else if autoStatus?.ok}<p class="small muted">Published (revision {autoStatus.revision}).</p>
        {:else if autoStatus}<p class="bad">{autoStatus.error}</p>{/if}
        <details class="atlas" open={atlasOpen} ontoggle={(e) => setAtlasOpen((e.currentTarget as HTMLDetailsElement).open)}>
          <summary>Atlas <span class="small muted">{picked[0]?.title}</span></summary>
          <div class="frame"><iframe bind:this={frame} src={atlasSrc} title="Atlas preview" onload={onAtlasLoad}></iframe></div>
        </details>
      {/if}
    </section>
  {/if}

  {#if built && !built.problems.length && isBuilt}
    <section>
      <h2><button type="button" class="tip" data-tip="Players read the campaign from a web address you choose. Publish puts the files there for you, free, on an account of yours.">Where players find it</button></h2>
      {#if !record}
        <p class="small muted">Save the campaign on this device first (above). Players can't join until it is published.</p>
      {:else}
        <label class="opt"><input type="radio" name="store" value="github" bind:group={storeKind} /><span><button type="button" class="tip" data-tip="GitHub is a free, open-source repository that anyone can use. It is unaffiliated with Hexmarch, so your files will always be yours. Hexmarch will provide step-by-step instructions for setting up your campaign."><strong>GitHub</strong></button> (preferred)</span></label>
        {#if storeKind === 'github'}
          <ol class="small gh">
            <li>
              Make a free <a href="https://github.com/signup" target="_blank" rel="noopener">GitHub account</a>, if you don't have one.
              <button type="button" class="tip" data-tip="GitHub stores your campaign files for free, and your players read them from there.">Why GitHub?</button>
              <label class="field">Your GitHub username <input type="text" bind:value={ghUser} placeholder="heph" autocapitalize="off" autocomplete="username" /></label>
            </li>
            <li>
              Name your <button type="button" class="tip" data-tip="A repository is a folder on GitHub. It has to be Public so players can read it, but only you can change it.">repository</button>,
              then <a href={newRepoLink} target="_blank" rel="noopener">create it on GitHub</a> and press <strong>Create repository</strong>.
              <label class="field">Repository name <input type="text" bind:value={ghName} placeholder={suggestedName} autocapitalize="off" /></label>
            </li>
            <li>
              Make a <button type="button" class="tip" data-tip="The key stays on this device and never goes into your campaign or its links. It can only touch this one repository.">key</button>
              so Scribe can save there: <a href={tokenLink} target="_blank" rel="noopener">open the key page</a>. Check that your
              repository is picked and <strong>Contents</strong> says <strong>Read and write</strong>, then press <strong>Generate token</strong> and copy it.
            </li>
            <li>Paste the key here, then press Publish (below).
              <label class="field">Key <input type="password" bind:value={secret} autocomplete="off" /></label>
            </li>
          </ol>
          <details class="small">
            <summary>Advanced</summary>
            <div class="row">
              <label class="field">Folder (optional) <input type="text" bind:value={ghDir} placeholder="kells" autocapitalize="off" /></label>
              <label class="field">Branch <input type="text" bind:value={ghBranch} autocapitalize="off" /></label>
            </div>
          </details>
        {/if}
        <label class="opt"><input type="radio" name="store" value="apps-script" bind:group={storeKind} /><span><button type="button" class="tip" data-tip="Google Drive is a popular file storage service that comes with any GMail account. Hexmarch will walk you through setting up an Apps Script, which will give Hexmarch limited access to the files on your Drive that Hexmarch will use to share your campaign with players and co-referees."><strong>Google Drive</strong></button></span></label>
        {#if storeKind === 'apps-script'}
          <details class="small" open={!scriptUrl}>
            <summary>Set up your script (once, about two minutes)</summary>
            <ol>
              <li>Open <a href="https://script.new" target="_blank" rel="noopener">script.new</a> signed in to Google, and name the project “Hexmarch publisher”.</li>
              <li><button class="quiet" onclick={copyScript}>Copy the script</button>{#if copied} Copied, with your key already in it.{/if} Replace everything in <code>Code.gs</code> with it, and save.</li>
              <li>Deploy › New deployment › type <strong>Web app</strong>. Execute as <strong>Me</strong>, Who has access <strong>Anyone</strong>. Deploy, and allow it to use your Drive (Google warns because the script is your own and unverified: Advanced › Go to Hexmarch publisher).</li>
              <li>Paste the Web app URL below. Your files go to the Drive folder “Hexmarch campaigns”.</li>
            </ol>
          </details>
          <label class="field">Web app URL <input type="url" bind:value={scriptUrl} placeholder="https://script.google.com/macros/s/…/exec" /></label>
          <label class="field">Key (the KEY line in your script) <input type="password" bind:value={secret} autocomplete="off" /></label>
        {/if}
        <label class="opt"><input type="radio" name="store" value="manual" bind:group={storeKind} /><span><button type="button" class="tip" data-tip="If you have your own website or server, Hexmarch can simply hand you the campaign files and let you place them somewhere that your players and co-referees can access them."><strong>My Own Host</strong></button></span></label>
        {#if storeKind === 'manual'}
          <label class="field">Folder you upload to <input type="url" bind:value={folder} placeholder="https://you.github.io/kells-1422/" /></label>
        {/if}
        <button disabled={!storeReady || !record.published || testing} onclick={runTest}>{testing ? 'Verifying…' : 'Verify Campaign Files'}</button>
        {#if test === 'none'}<p class="small muted">Publish first (below), then verify.</p>
        {:else if typeof test === 'string'}<p class="bad">{test}</p>
        {:else if test}
          <ul class="small test">
            <li class={test.pointer === 'matches' ? 'ok' : 'bad'}><code>campaign.json</code> {SAYS[test.pointer]}</li>
            <li class={test.snapshot === 'matches' ? 'ok' : 'bad'}><code>snapshot.json</code> {SAYS[test.snapshot]}{test.found !== undefined && test.snapshot !== 'matches' ? ` (revision ${test.found} there, ${record.published?.revision} published)` : ''}</li>
          </ul>
        {/if}
        <label class="field">Where players send requests (optional for now) <input type="url" bind:value={postUrl} placeholder="https://script.google.com/…/exec" /></label>
      {/if}
    </section>
    {#if record}
      <section>
        <h2><button type="button" class="tip" data-tip="Publishing writes what players may see: the campaign, its modules and the shared state (clock, party, what everyone knows), as it stands on this device now, plus each character's knowledge for their player alone and which requests you have answered. It is the same as Update campaign in the Companion, so either one can publish. Nothing only you should see goes in. Invite a player opens in the Companion once it is published.">Publish</button></h2>
        <button disabled={!storeReady || publishing} onclick={publish}>{publishing ? 'Publishing…' : record.published ? 'Publish again' : 'Publish'}</button>
        {#if publishError}<p class="bad">{publishError}</p>{/if}
        {#if record.published}
          <p class="small muted">Published (revision {record.published.revision}, {new Date(record.published.at).toLocaleString()}).
            {#if justPublished}{#if record.services?.store && record.services.store.kind !== 'manual'}Both files are up; players see them within a few minutes.{:else}Upload <code>campaign.json</code> and <code>snapshot.json</code> into <code>{record.services?.folder}</code>, replacing the old ones.{/if}{/if}
            Players' invitations name <code>{record.services?.pointer}</code>.</p>
        {/if}
      </section>
    {/if}
  {/if}

  <footer class="small muted"><a href="../">Companion</a><a href="../atlas/">Atlas</a></footer>
</main>
