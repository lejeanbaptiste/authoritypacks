import { addSearchString, normalizeSurface } from './normalize.mjs';

/** Symbols and Latin letters — excluded from person match strings (CBDB v1 policy). */
const BLOCKED_CHAR_RE = /[\*(\[\-]|[A-Za-z]/;

/** Placeholder names: 王某, 李某, … (CBDB blocks surname+某; also block any single-surname + 某). */
const PLACEHOLDER_MOU_RE = /^[\u4e00-\u9fff]某$/;

/** Birth-order style names (CBDB altname type 7 — 行第). */
const BIRTH_ORDER_RE = /^[\u4e00-\u9fff]{1,3}(?:[0-9]+|[一二三四五六七八九十廿卅卌]+)$/;

/** Alias forms like 子徴 / 子微 — courtesy marker + zi body. */
const ZI_PREFIX_RE = /^子([\u4e00-\u9fff]{1,2})$/;

/** @param {string} s */
export function codePointLength(s) {
  return [...normalizeSurface(s)].length;
}

/**
 * Global person-string block list (shared CBDB + Wikidata).
 * @param {string} surface
 * @param {string | null | undefined} surnameChn
 */
export function isBlockedPersonString(surface, surnameChn) {
  const s = normalizeSurface(surface);
  if (!s) return true;
  if (BLOCKED_CHAR_RE.test(s)) return true;
  if (PLACEHOLDER_MOU_RE.test(s)) return true;
  if (BIRTH_ORDER_RE.test(s)) return true;
  const sur = normalizeSurface(surnameChn ?? '');
  if (sur && (s === `${sur}氏` || s === `${sur}某`)) return true;
  return false;
}

/**
 * @param {Set<string>} set
 * @param {string} surface
 * @param {string | null | undefined} surnameChn
 */
export function addPersonSearchString(set, surface, surnameChn) {
  if (isBlockedPersonString(surface, surnameChn)) return;
  addSearchString(set, surface);
}

/**
 * Strip leading 子 from Wikidata zi-style aliases (子徴 → 徴).
 * @param {string} alias
 */
export function ziBodyFromAlias(alias) {
  const s = normalizeSurface(alias);
  const m = ZI_PREFIX_RE.exec(s);
  return m ? m[1] : s;
}

/**
 * Infer single-character surname from a Chinese primary label when P734 is missing.
 * @param {string} primaryLabel
 */
export function inferFamilyNameFromLabel(primaryLabel) {
  const primary = normalizeSurface(primaryLabel);
  if (!primary || !/^[\u4e00-\u9fff]/.test(primary)) return '';
  const len = codePointLength(primary);
  if (len < 2 || len > 4) return '';
  return [...primary][0] ?? '';
}
