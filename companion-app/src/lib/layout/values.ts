// Named values (SHEET_LAYOUT.md section 4): a layout reads them by dotted name from a scope of plain
// data, never by calling code. A name that isn't there reads as undefined, which the load check reports.

export type Scope = Record<string, unknown>;

export function lookup(scope: Scope, key: string): unknown {
  let v: unknown = scope;
  for (const part of key.split('.')) {
    if (v === null || typeof v !== 'object' || !Object.prototype.hasOwnProperty.call(v, part)) return undefined;
    v = (v as Record<string, unknown>)[part];
  }
  return v;
}

export function has(scope: Scope, key: string): boolean {
  let v: unknown = scope;
  for (const part of key.split('.')) {
    if (v === null || typeof v !== 'object' || !Object.prototype.hasOwnProperty.call(v, part)) return false;
    v = (v as Record<string, unknown>)[part];
  }
  return true;
}

export function truthy(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0;
  return v !== undefined && v !== null && v !== false && v !== 0 && v !== '';
}

export function show(v: unknown, format?: 'signed'): string {
  if (v === undefined || v === null || v === false) return '';
  if (typeof v === 'number' && format === 'signed') return v > 0 ? `+${v}` : String(v);
  if (typeof v === 'object') return '';
  return String(v);
}
