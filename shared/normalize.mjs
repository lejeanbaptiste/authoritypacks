/** @typedef {import('./types.mjs').AuthorityCandidate} AuthorityCandidate */

const DEFAULT_MIN = 2;
const LATIN_MIN = 3;

/** Chinese numeral characters (digits + place-value units, incl. 萬). */
const CHINESE_NUMERAL_ONLY_RE = /^[一二三四五六七八九十百千萬]+$/;

/**
 * True when `surface` is composed entirely of Chinese numeral characters
 * (e.g. 三, 十二, 一百), which occur as junk placeName/title/persName
 * entries picked up from ordinal/enumeration text rather than real names.
 * @param {string} surface
 */
export function isChineseNumeralOnly(surface) {
  const s = normalizeSurface(surface);
  return s.length > 0 && CHINESE_NUMERAL_ONLY_RE.test(s);
}

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
  // Place/work/org packs otherwise pick up ordinal enumeration junk (一八, 十二, …).
  if (isChineseNumeralOnly(s)) return;
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
