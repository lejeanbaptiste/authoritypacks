/** @typedef {import('./types.mjs').AuthorityCandidate} AuthorityCandidate */

const DEFAULT_MIN = 2;

/** Chinese numeral characters (digits + place-value units, incl. 萬). */
const CHINESE_NUMERAL_ONLY_RE = /^[一二三四五六七八九十百千萬]+$/;

/**
 * Any Latin-script letter (ASCII or accented). Tagging packs match CJK /
 * Tibetan / etc. source text — Latin surfaces are never useful searchStrings.
 * Fullwidth Latin (Ａ–Ｚ) is included separately (not Script=Latin).
 */
const LATIN_LETTER_RE = /\p{Script=Latin}|[Ａ-Ｚａ-ｚ]/u;

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
 * True when the surface contains any Latin letter (incl. accented / fullwidth).
 * @param {string} surface
 */
export function containsLatinLetters(surface) {
  return LATIN_LETTER_RE.test(surface ?? '');
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
  // Tag packs never index Latin (romanization, English titles, catalog codes…).
  if (containsLatinLetters(s)) return false;
  const min = opts.minLength ?? DEFAULT_MIN;
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
