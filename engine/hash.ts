// Stable hashes of JSON values: the lockfile's manifest hashes and the field patches' "was" (SCRIBE.md section 3).

// JSON with every object's keys sorted, so the same value always gives the same text.
export function canonical(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const o = value as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
}

export async function sha256(text: string): Promise<string> {
  const bytes = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return 'sha256:' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function hashValue(value: unknown): Promise<string> {
  return sha256(canonical(value));
}
