<script lang="ts" module>
  import type { Snippet } from 'svelte';
  import type { Action, Check, LNode } from '../../lib/layout/parse';
  import type { Scope } from '../../lib/layout/values';
  import type { Difficulty } from '../../rules/rules';

  // What the surface around a layout wires in: rolls, the Companion's own editors, the portrait.
  export interface LayoutFrame {
    // Undefined on a printout: roll buttons are then plain text.
    roll?: (check: Check, value: unknown, opts: { label?: string; min?: number; difficulty?: Difficulty }) => void;
    actions: Partial<Record<Action, (value: unknown) => void>>;
    portrait?: Snippet<[string]>;
  }
</script>

<script lang="ts">
  import Self from './LayoutNodes.svelte';
  import PageRef from '../PageRef.svelte';
  import { holdRoll } from '../../lib/hold.svelte';
  import { lookup, show, truthy } from '../../lib/layout/values';

  let { nodes, scope, frame }: { nodes: LNode[]; scope: Scope; frame: LayoutFrame } = $props();

  const HOLD: Check[] = ['talent', 'save', 'attack'];

  function classes(n: Exclude<LNode, { t: 'text' }>, extra = ''): string {
    const on = n.when.filter((w) => truthy(lookup(scope, w.key))).map((w) => w.cls);
    const print = n.print === 'only' ? 'print-only' : n.print === 'never' ? 'screen-only' : '';
    return [extra, n.cls, ...on, print].filter(Boolean).join(' ');
  }

  // An e9-each's list, capped at max and padded to min with blank entries ({ blank: true }).
  function items(n: Extract<LNode, { t: 'each' }>): unknown[] {
    const v = lookup(scope, n.list);
    let list = Array.isArray(v) ? v : [];
    if (n.max !== undefined) list = list.slice(0, n.max);
    if (n.min !== undefined && list.length < n.min) list = [...list, ...Array.from({ length: n.min - list.length }, () => ({ blank: true }))];
    return list;
  }

  const within = (as: string, item: unknown): Scope => ({ ...scope, [as]: item });
</script>

{#each nodes as n, idx (idx)}
  {#if n.t === 'text'}{n.text}{:else if n.t === 'el'}
    <svelte:element this={n.tag} class={classes(n) || undefined}>{#if n.children.length}<Self nodes={n.children} {scope} {frame} />{/if}</svelte:element>
  {:else if n.t === 'value'}
    {@const text = show(lookup(scope, n.key), n.format)}
    {#if n.cls || n.when.length || n.print}<span class={classes(n)}>{text || n.fallback || ''}</span>{:else}{text || n.fallback || ''}{/if}
  {:else if n.t === 'roll'}
    {@const value = lookup(scope, n.key)}
    {#if HOLD.includes(n.check)}
      <button type="button" class={classes(n, 'tap')} disabled={!frame.roll} use:holdRoll={(difficulty) => frame.roll?.(n.check, value, { label: n.label, min: n.min, difficulty })}><Self nodes={n.children} {scope} {frame} /></button>
    {:else}
      <button type="button" class={classes(n, 'tap')} disabled={!frame.roll} onclick={() => frame.roll?.(n.check, value, { label: n.label, min: n.min })}><Self nodes={n.children} {scope} {frame} /></button>
    {/if}
  {:else if n.t === 'action'}
    {@const handler = frame.actions[n.do]}
    {@const value = n.key ? lookup(scope, n.key) : undefined}
    <button type="button" class={classes(n, 'tap')} disabled={!handler || (!!n.off && truthy(lookup(scope, n.off)))} onclick={() => handler?.(value)}><Self nodes={n.children} {scope} {frame} /></button>
  {:else if n.t === 'each'}
    {#each items(n) as item, i (i)}<Self nodes={n.children} scope={within(n.as, item)} {frame} />{/each}
  {:else if n.t === 'if'}
    {#if truthy(lookup(scope, n.key)) !== n.not}<Self nodes={n.children} {scope} {frame} />{/if}
  {:else if n.t === 'portrait'}
    {@render frame.portrait?.(classes(n))}
  {:else if n.t === 'ref'}
    {@const page = lookup(scope, n.ref)}
    <PageRef page={typeof page === 'number' || typeof page === 'string' ? page : n.ref} />
  {/if}
{/each}
