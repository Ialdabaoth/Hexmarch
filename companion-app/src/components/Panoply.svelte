<script lang="ts">
  import { wikiForCantrip, wikiForEntry, wikiPage } from '../lib/wiki';
  import PageRef from './PageRef.svelte';
  import { app } from '../lib/app.svelte';
  import type { Ruleset } from '../rules/rules';
  import { RARITIES, type EquipmentItem, type MagicEntry } from '../equipment/equipment';

  // The equipment the chosen rules use: the book's gear and magic, plus custom entries.
  let { rules }: { rules: Ruleset } = $props();

  let query = $state('');
  let customCount = $derived(app.local.items.length + app.local.magic.length);

  let catalog = $derived.by(() => {
    // Redraw when custom equipment or the campaign changes.
    void app.sheets;
    void app.local;
    return rules.equipment;
  });

  // The panoply as a tree: Gear (weapons, armor, other) and Magic (each tradition by
  // circle, dweomercraft by rarity, alchemy apart from enchantments).
  interface Entry { key: string; ref: string; name: string; page?: number; summary?: string; note?: string; href?: string }
  interface Node { label: string; entries?: Entry[]; children?: Node[]; href?: string | null }

  const CIRCLES = ['First', 'Second', 'Third', 'Fourth', 'Fifth'];
  const byName = (a: Entry, b: Entry) => a.name.localeCompare(b.name);
  const entry = (x: (EquipmentItem | MagicEntry) & { ref: string }, extra: Partial<Entry> = {}): Entry =>
    ({ key: x.ref, ref: x.ref, name: x.name, page: x.page, summary: x.summary, ...extra });

  let tree = $derived.by((): Node[] => {
    const items = catalog.items;
    const magic = catalog.magic;
    const circles = (system: string, n: number): Node[] =>
      CIRCLES.slice(0, n).map((c, i) => ({
        label: `${c} Circle`,
        entries: magic.filter((m) => m.system === system && m.circle === i + 1).map((m) => entry(m)).sort(byName)
      }));
    const rarityOf = (m: MagicEntry) => m.rarities ?? (m.rarity ? [m.rarity] : []);
    const dweomers = RARITIES.flatMap((r) => {
      const label = r[0].toUpperCase() + r.slice(1);
      const at = magic.filter((m) => m.system === 'dweomer' && rarityOf(m).includes(r));
      return [
        { label: `${label} Alchemy`, entries: at.filter((m) => m.form === 'potion').map((m) => entry(m, { key: `${m.ref}@${r}` })).sort(byName) },
        { label: `${label} Enchantments`, entries: at.filter((m) => m.form !== 'potion').map((m) => entry(m, { key: `${m.ref}@${r}` })).sort(byName) }
      ];
    });
    // Each spell has a cantrip; several share one, so each cantrip shows once with its spells.
    const bySpell = new Map<string, string[]>();
    for (const m of magic) if (m.system === 'arcane' && m.cantrip) bySpell.set(m.cantrip, [...(bySpell.get(m.cantrip) ?? []), m.name]);
    const cantrips: Entry[] = [...bySpell].map(([name, spells]) => ({
      key: `cantrip:${name}`, ref: '', name, note: `from ${spells.sort().join(', ')}`, href: wikiForCantrip(name)
    })).sort(byName);
    return [
      {
        label: 'Gear',
        children: [
          { label: 'Weapons', entries: items.filter((i) => i.kind === 'weapon' && !i.shield).map((i) => entry(i)).sort(byName) },
          { label: 'Armor', entries: items.filter((i) => i.kind === 'armor' || i.shield).map((i) => entry(i)).sort(byName) },
          { label: 'Other Gear', entries: items.filter((i) => i.kind !== 'weapon' && i.kind !== 'armor').map((i) => entry(i)).sort(byName) }
        ]
      },
      {
        label: 'Magic',
        children: [
          { label: 'Arcane Spells', children: [{ label: 'Cantrips', entries: cantrips }, ...circles('arcane', 5)] },
          { label: 'Divine Miracles', children: [{ label: 'Rebuke the Unholy', href: wikiPage('Miracles#divine-rebuke') }, ...circles('divine', 5)] },
          { label: 'Primal Druidcraft', children: circles('primal', 4) },
          { label: 'Dweomercraft', children: dweomers }
        ]
      }
    ];
  });

  // While searching, only branches with matches show, opened.
  const matches = (e: Entry, q: string) => !q || e.name.toLowerCase().includes(q) || !!e.note?.toLowerCase().includes(q);
  function prune(nodes: Node[], q: string): Node[] {
    if (!q) return nodes;
    return nodes.flatMap((n) => {
      if (n.href) return n.label.toLowerCase().includes(q) ? [n] : [];
      const entries = n.entries?.filter((e) => matches(e, q));
      const children = n.children ? prune(n.children, q) : undefined;
      return entries?.length || children?.length ? [{ ...n, entries, children }] : [];
    });
  }
  let q = $derived(query.trim().toLowerCase());
  let shown = $derived(prune(tree, q));
  const count = (n: Node): number => (n.entries?.length ?? 0) + (n.children ?? []).reduce((t, c) => t + count(c), 0);
</script>

<details class="section">
  <summary><h2>Panoply</h2></summary>
  <input type="search" bind:value={query} placeholder="Find gear or magic" aria-label="Find gear or magic" autocomplete="off" />
  {#snippet branch(nodes: Node[], depth: number)}
    {#each nodes as n (n.label)}
      {#if n.href}
        <p class="leaf" style:--depth={depth}><a href={n.href} target="_blank" rel="noopener">{n.label}</a></p>
      {:else}
        <details class="node" style:--depth={depth} open={!!q}>
          <summary><span class:top={depth === 0}>{n.label}</span> <span class="small muted">{count(n)}</span></summary>
          {#if n.children}{@render branch(n.children, depth + 1)}{/if}
          {#if n.entries}
            <ul class="entries">
              {#each n.entries as e (e.key)}
                <li>
                  <strong>{e.name}</strong>
                  <span class="small muted">{#if e.note}· {e.note}{/if}{#if e.page || e.href}{' · '}<PageRef page={e.page} href={e.href ?? wikiForEntry(e.ref)} />{/if}{e.ref.startsWith('local:') ? ' · custom' : ''}</span>
                  {#if e.summary}<div class="small">{e.summary}</div>{/if}
                </li>
              {:else}
                <li class="small muted">None.</li>
              {/each}
            </ul>
          {/if}
        </details>
      {/if}
    {/each}
  {/snippet}
  <div class="tree">
    {@render branch(shown, 0)}
    {#if !shown.length}<p class="small muted">Nothing matches.</p>{/if}
  </div>

  <section class="card" style="margin-top:0.75rem">
    <h3>Custom equipment</h3>
    <p class="small muted">
      Items, spells and dweomers your referee has approved that aren't in the book. {customCount
        ? `${customCount} entr${customCount === 1 ? 'y' : 'ies'} on this device.`
        : 'None yet.'}
    </p>
    <button onclick={() => (app.view = { name: 'equipment' })}>Edit custom equipment</button>
  </section>
</details>

<style>
  .tree { margin-top: 0.5rem; }
  .node, .leaf { margin: 0.15rem 0 0 calc(var(--depth) * 0.9rem); }
  .node > summary { cursor: pointer; padding: 0.3rem 0; font-weight: 600; }
  .node > summary .top { font-family: Georgia, serif; font-size: 1.05rem; }
  .leaf { padding: 0.3rem 0 0.3rem 1rem; font-weight: 600; margin-top: 0; margin-bottom: 0; }
  .leaf a { color: var(--accent); }
  .entries { list-style: none; padding: 0; margin: 0 0 0.4rem 1.1rem; }
  .entries li { padding: 0.35rem 0; border-bottom: 1px solid var(--line); }
</style>
