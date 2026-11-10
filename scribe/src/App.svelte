<script lang="ts">
  import { ROOTS, RULES_MANIFESTS, type RootChoice } from './lib/rules';
  import { loadSite, type SiteModule } from './lib/data';
  import { buildCampaign, describeProblem, startsOf, type Built, type Choices } from './lib/campaign';
  import { applyUpdate, campaignLink, campaignMessage, publishOnDevice, publishSecret, saveOnDevice, savePublishSecret, savedCampaign, testUpload, type SavedCampaign, type UpdateResult } from './lib/device';
  import type { UploadCheck, UploadReport } from '../../engine';
  import { appsScriptCode, appsScriptStore, githubStore, messageLink, newKey, readMessageHash, servicesFor, staticServices, upload, type Services, type StoreKind } from '../../engine';

  const VERSION = __SCRIBE_VERSION__;
  const params = new URLSearchParams(location.search);
  const DRAFT = 'hexmarch-scribe-draft';

  interface Draft {
    title: string;
    root: string; // "<module>/<option>"
    modules: string[];
    start: string; // "<module>/<start id>", or "manual"
    manual: { module: string; site: string; date: string; hour: number };
  }
  const blank: Draft = { title: '', root: '', modules: [], start: '', manual: { module: '', site: '', date: '3507-05-01', hour: 8 } };
  function loadDraft(): Draft {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT) ?? 'null');
      return d ? { ...blank, ...d, manual: { ...blank.manual, ...(d.manual ?? {}) } } : structuredClone(blank);
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
  const offers = $derived(picked.flatMap((m) => startsOf(m).map((s) => ({ module: m, start: s }))));
  const manualModule = $derived(site.find((m) => m.id === (draft.manual.module || picked[0]?.id)) ?? null);

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
    let start: Choices['start'] = null;
    if (d.start === 'manual') start = { module: d.manual.module || d.modules[0], site: d.manual.site, date: d.manual.date, hour: Number(d.manual.hour) || 0 };
    else if (d.start) {
      const [module, ...rest] = d.start.split('/');
      start = { module, id: rest.join('/') };
    }
    const choices: Choices = { title: d.title, root, modules: d.modules, start };
    buildCampaign(choices, $state.snapshot(site) as SiteModule[], RULES_MANIFESTS).then((b) => (built = b));
  });

  function toggle(id: string) {
    draft.modules = draft.modules.includes(id) ? draft.modules.filter((m) => m !== id) : [...draft.modules, id];
    if (draft.start && draft.start !== 'manual' && !draft.modules.includes(draft.start.split('/')[0])) draft.start = '';
  }

  function download(name: string, data: unknown) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1) + '\n'], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const startSite = $derived.by(() => {
    if (!built) return null;
    const s = built.manifest.start as { module: string; id: string } | undefined;
    const module = s?.module ?? (draft.start === 'manual' ? draft.manual.module || draft.modules[0] : '');
    const places = (built.state.revealed as Record<string, { places: string[] }>)[module]?.places ?? [];
    const slugOf = draft.start === 'manual' ? draft.manual.site : places[0];
    return module ? { module, slug: slugOf ?? '' } : null;
  });
  const atlasLink = $derived(
    startSite ? `../atlas/?site=${encodeURIComponent(siteUrl)}&module=${encodeURIComponent(startSite.module)}${startSite.slug ? `#site:${startSite.slug}` : ''}` : ''
  );

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
        confirm(`This device already has play for “${title}” (state revision ${rev}): where the party is, the clock and what it has found. Start it again from this campaign's start?\n\nOK starts again; Cancel keeps the play and saves only the campaign.`)
      );
      wroteState = saved.wroteState;
      savedAs = saved.link;
      return savedAs;
    } catch (e) {
      saveError = `Scribe couldn't save on this device: ${(e as Error).message || e}. A private window may not allow it; download the files instead.`;
      return null;
    }
  }
  // Steps 8 and 9: Services and Publish (SCRIBE.md section 5).
  let record = $state<SavedCampaign | null>(null);
  let folder = $state('');
  let postUrl = $state('');
  // Where Publish puts the files (Scribe 0.6: adapters): the referee's own GitHub repo (preferred, Heph 2026-11-10),
  // Google Drive through their own Apps Script, or by hand as before.
  let storeKind = $state<StoreKind>('github');
  let scriptUrl = $state('');
  let ghRepo = $state('');
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
          ghRepo = `${st.owner}/${st.repo}`;
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

  // Update in Scribe (Companion -> Scribe, a link to scribe/#m=...): play to publish from.
  let received = $state<UpdateResult | null>(null);
  let receiveError = $state('');
  (async () => {
    try {
      const e = await readMessageHash(location.hash);
      if (!e) return;
      received = await applyUpdate(e);
      history.replaceState(null, '', location.pathname + location.search);
    } catch (e) {
      receiveError = `Scribe couldn't read that link: ${(e as Error).message || e}`;
    }
  })();

  async function openIn(app: 'companion' | 'atlas') {
    const link = await save();
    if (!link) return;
    const c = encodeURIComponent(link);
    if (app === 'companion') {
      // Apps talk by links: the Companion gets the campaign, and the state to start from when Scribe just wrote it
      const rec = await savedCampaign(String(built!.manifest.id));
      if (rec) location.href = await messageLink(new URL('../', location.href).href, campaignMessage(rec, wroteState ? $state.snapshot(built!.state) : undefined));
    }
    else if (startSite) location.href = `../atlas/?site=${encodeURIComponent(siteUrl)}&module=${encodeURIComponent(startSite.module)}&campaign=${c}${startSite.slug ? `&place=site:${startSite.slug}#site:${startSite.slug}` : ''}`;
  }
</script>

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
      {#if received.status === 'applied'}Received play for “{received.title ?? received.campaign}” from the Companion (state revision {received.revision}). Publish again to share it.
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

  {#if root && picked.length}
  <section>
    <h2>Start</h2>

      {#each offers as o (o.module.id + '/' + o.start.id)}
        <label class="opt">
          <input type="radio" name="start" value={`${o.module.id}/${o.start.id}`} bind:group={draft.start} />
          <span>
            <strong>{o.start.title ?? o.start.id}</strong> <span class="small muted">{o.module.title}</span>
            <br /><span class="small muted">
              {[o.start.site, o.start.date, o.start.levels ? `levels ${o.start.levels[0]}–${o.start.levels[1]}` : '', o.start.uses?.length ? `plays ${o.start.uses.join(', ')}` : '']
                .filter(Boolean)
                .join(' · ')}
            </span>
          </span>
        </label>
      {/each}
      <label class="opt">
        <input type="radio" name="start" value="manual" bind:group={draft.start} />
        <span><strong>Place the party yourself</strong></span>
      </label>
      {#if draft.start === 'manual'}
        <div class="row">
          <select bind:value={draft.manual.module}>
            {#each picked as m (m.id)}<option value={m.id}>{m.title}</option>{/each}
          </select>
          <select bind:value={draft.manual.site}>
            <option value="">No place yet</option>
            {#each manualModule?.sites ?? [] as s (s.slug)}<option value={s.slug}>{s.name}</option>{/each}
          </select>
          <input type="text" bind:value={draft.manual.date} placeholder="3507-05-01" />
          <input type="number" min="0" max="23" bind:value={draft.manual.hour} />
        </div>
      {/if}
  </section>
  {/if}

  {#if built}
    <section>
      <h2>Your campaign</h2>
      {#if built.problems.length}
        <p class="bad">Scribe can't settle the modules yet:</p>
        <ul class="problems">{#each built.problems as p}<li>{describeProblem(p)}</li>{/each}</ul>
      {:else}
        <p class="small muted">{built.lock.modules.map((m) => `${m.id} ${m.version}`).join(' · ')}</p>
      {/if}
      <h3><button type="button" class="tip" data-tip="The campaign stays on this device: the Companion, the Atlas and Scribe share it here. The Atlas puts the party at the start the first time it opens.">Play it</button></h3>
      <div class="row">
        <button disabled={!!built.problems.length} onclick={() => openIn('companion')}>Save and open in the Companion</button>
        {#if startSite}<button disabled={!!built.problems.length} onclick={() => openIn('atlas')}>Save and open the start in the Atlas</button>{/if}
        <button class="quiet" disabled={!!built.problems.length} onclick={save}>Save on this device</button>
      </div>
      {#if saveError}<p class="bad">{saveError}</p>{/if}
      {#if savedAs}<p class="small muted">Saved on this device, with your Referee invitation: the Companion lists it in its campaigns. Its link is <code>{savedAs}</code>{#if savedAs !== campaignLink(String(built.manifest.id))} (renamed since: save again){/if}.</p>{/if}
      <details class="files">
        <summary><span class="tip" data-tip="Keep these three files together to back up the campaign or move it to another device.">Campaign Files</span></summary>
        <ul>
          <li><a href="#module.json" onclick={(e) => (e.preventDefault(), download('module.json', built!.manifest))}>module.json</a></li>
          <li><a href="#campaign.lock.json" onclick={(e) => (e.preventDefault(), download('campaign.lock.json', built!.lock))}>campaign.lock.json</a></li>
          <li><a href="#state.json" onclick={(e) => (e.preventDefault(), download('state.json', built!.state))}>state.json</a></li>
          {#if atlasLink}<li><a href={atlasLink}>Look at the start in the Atlas</a></li>{/if}
        </ul>
      </details>
    </section>
  {/if}

  {#if built && !built.problems.length}
    <section>
      <h2><button type="button" class="tip" data-tip="Players read the campaign from a web address you choose. Publish puts the files there for you, free, on an account of yours.">Where players find it</button></h2>
      {#if !record}
        <p class="small muted">Save the campaign on this device first (above). Players can't join until it is published.</p>
      {:else}
        <label class="opt"><input type="radio" name="store" value="github" bind:group={storeKind} /><span><strong>GitHub</strong> (preferred) <span class="small muted">a public repository of yours</span></span></label>
        <label class="opt"><input type="radio" name="store" value="apps-script" bind:group={storeKind} /><span><strong>Google Drive</strong> <span class="small muted">through your own Apps Script, set up once</span></span></label>
        <label class="opt"><input type="radio" name="store" value="manual" bind:group={storeKind} /><span><strong>Upload by hand</strong> <span class="small muted">to any web folder; Publish hands you the two files</span></span></label>
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
        {:else if storeKind === 'github'}
          <details class="small" open={!ghRepo}>
            <summary>Set up GitHub (once)</summary>
            <ol>
              <li>Make a <strong>public</strong> repository for your campaigns (players read the files from it, so keep secrets out of it).</li>
              <li>Make a <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">fine-grained token</a>: Only select repositories › that one; Permissions › Contents › Read and write. Paste it below. It stays on this device.</li>
            </ol>
          </details>
          <div class="row">
            <label class="field">Repository <input type="text" bind:value={ghRepo} placeholder="you/kells-1422" autocapitalize="off" /></label>
            <label class="field">Folder (optional) <input type="text" bind:value={ghDir} placeholder="kells" autocapitalize="off" /></label>
            <label class="field">Branch <input type="text" bind:value={ghBranch} autocapitalize="off" /></label>
          </div>
          <label class="field">Token <input type="password" bind:value={secret} autocomplete="off" /></label>
        {:else}
          <label class="field">Folder you upload to <input type="url" bind:value={folder} placeholder="https://you.github.io/kells-1422/" /></label>
        {/if}
        <button class="quiet" disabled={!storeReady || !record.published || testing} onclick={runTest}>{testing ? 'Testing…' : 'Test'}</button>
        {#if test === 'none'}<p class="small muted">Publish first (below), then test.</p>
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
