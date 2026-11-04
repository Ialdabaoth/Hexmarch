<script lang="ts">
  import { onMount } from 'svelte';
  import { loadModuleList, saveModuleList } from '../lib/storage';
  import { loadRepo, viewerUrl, type SavedModule } from '../lib/modules';

  // Module repositories the referee has added. Each module's viewer opens in its own page.
  let saved = $state<SavedModule[]>([]);
  let address = $state('');
  let busy = $state(false);
  let problem = $state('');

  onMount(async () => {
    try {
      saved = await loadModuleList();
    } catch (e) {
      problem = (e as Error).message;
    }
  });

  async function add() {
    busy = true;
    problem = '';
    try {
      const { modules } = await loadRepo(address);
      // Re-adding a repository replaces its modules, so updates arrive with a fresh fetch.
      saved = [...saved.filter((m) => !modules.some((n) => n.id === m.id && n.base === m.base)), ...modules];
      address = '';
      await saveModuleList(saved);
    } catch (e) {
      problem = (e as Error).message;
    }
    busy = false;
  }

  async function remove(m: SavedModule) {
    saved = saved.filter((x) => x !== m);
    try {
      await saveModuleList(saved);
    } catch (e) {
      problem = (e as Error).message;
    }
  }
</script>

<section class="card" style="margin-top:0.75rem">
  <h3>Modules</h3>
  <p class="small muted">Paste a module repository's web address (its site, where mm.json sits). Modules open in the browser and stay usable offline once added.</p>
  <div class="row">
    <input class="grow" type="url" bind:value={address} placeholder="https://owner.github.io/repo/" aria-label="Module repository address" autocomplete="off" />
    <button class="primary" onclick={add} disabled={busy || !address.trim()}>{busy ? 'Reading…' : 'Add'}</button>
  </div>
  {#if problem}<p class="small failure" role="alert">{problem}</p>{/if}

  {#if saved.length}
    <ul class="modules">
      {#each saved as m (m.base + m.id)}
        <li>
          <div>
            <strong>{m.manifest.title}</strong> <span class="small muted">v{m.manifest.version} · {m.manifest.license}</span>
            <div class="small muted">{m.manifest.books?.length ?? 0} books</div>
          </div>
          <div class="row">
            <a class="button-like" href={viewerUrl(m.base, m.path ?? `${m.id}/`)} target="_blank" rel="noopener">Open</a>
            <button class="ghost" onclick={() => remove(m)} aria-label="Remove {m.manifest.title}">Remove</button>
          </div>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="small muted">No modules added yet.</p>
  {/if}
</section>

<style>
  .modules { list-style: none; padding: 0; margin: 0.5rem 0 0; display: grid; gap: 0.5rem; }
  .modules li { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  .button-like { display: inline-block; padding: 0.4rem 0.8rem; border: 1px solid currentColor; border-radius: 6px; text-decoration: none; color: inherit; }
</style>
