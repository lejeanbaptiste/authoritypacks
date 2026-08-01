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
  if (k === 'person' || k === 'office' || k === 'place') return `${k}-${bare}`;
  return bare;
}

export function bareNorbertAuthorityValue(value) {
  const trimmed = String(value ?? '').trim();
  const match = trimmed.match(KIND_PREFIX);
  return match ? match[2] : trimmed;
}
