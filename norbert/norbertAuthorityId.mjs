/**
 * Format / bare / lookup helpers for Norbert authority idnos.
 * @see leaf-writer/.../norbertAuthorityId.ts
 */

const KIND_PREFIX = /^(person|office|place)[-:](.+)$/i;

export function formatNorbertAuthorityValue(kind, bareId) {
  const bare = String(bareId ?? '').trim();
  const k = String(kind ?? '').trim().toLowerCase();
  if (!bare) return bare;
  const existing = bare.match(KIND_PREFIX);
  if (existing) return `${existing[1].toLowerCase()}-${existing[2]}`;
  // Only namespace numeric ids; leave noble-title / wiki-nt URNs alone.
  if ((k === 'person' || k === 'office' || k === 'place') && /^\d+$/.test(bare)) {
    return `${k}-${bare}`;
  }
  return bare;
}

export function bareNorbertAuthorityValue(value) {
  const trimmed = String(value ?? '').trim();
  const match = trimmed.match(KIND_PREFIX);
  return match ? match[2] : trimmed;
}

/** Lookup keys so typed PEDB idnos still hit bare pack rows (and vice versa). */
export function norbertAuthorityLookupValues(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return [];
  const match = trimmed.match(KIND_PREFIX);
  const bare = match ? match[2] : trimmed;
  const values = new Set([trimmed]);
  if (bare !== trimmed) values.add(bare);
  if (/^\d+$/.test(bare)) {
    const kind = match?.[1]?.toLowerCase() ?? 'person';
    values.add(`${kind}-${bare}`);
  }
  return [...values];
}
