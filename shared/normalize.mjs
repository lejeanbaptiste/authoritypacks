/** @typedef {import('./types.mjs').AuthorityCandidate} AuthorityCandidate */

const DEFAULT_MIN = 2;
const LATIN_MIN = 3;

/**
 * NFC trim; collapse internal whitespace.
 * @param {string} raw
 */
export function normalizeSurface(raw) {
  if (!raw) return '';
  return raw.normalize('NFC').replace(/\s+/g, ' ').trim();
}

/**
 * @param {string} surface
 * @param {{ script?: string, minLength?: number }} [opts]
 */
export function isValidSearchString(surface, opts = {}) {
  const s = normalizeSurface(surface);
  if (!s) return false;
  const min =
    opts.minLength ??
    (opts.script === 'latn' || /^[\u0000-\u024F\s\-'.]+$/.test(s) ? LATIN_MIN : DEFAULT_MIN);
  return [...s].length >= min;
}

/**
 * @param {Set<string>} set
 * @param {string} surface
 * @param {{ script?: string }} [opts]
 */
export function addSearchString(set, surface, opts) {
  const s = normalizeSurface(surface);
  if (isValidSearchString(s, opts)) set.add(s);
}

/**
 * Split CBDB c_alt_names field (semicolon-separated).
 * @param {string | null | undefined} raw
 */
export function splitAltNamesField(raw) {
  if (!raw) return [];
  return raw
    .split(/[;；]/)
    .map((s) => normalizeSurface(s))
    .filter(Boolean);
}
