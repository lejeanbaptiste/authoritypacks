import { addSearchString, normalizeSurface } from '../shared/normalize.mjs';
import { ALTNAME_EXCLUDE } from './constants.mjs';

/** Symbols and Latin letters — excluded from person match strings (👤 v1 policy). */
const BLOCKED_CHAR_RE = /[\*(\[\-]|[A-Za-z]/;

/**
 * @param {string} surface
 * @param {string | null | undefined} surnameChn
 */
export function isBlockedCbdbPersonString(surface, surnameChn) {
  const s = normalizeSurface(surface);
  if (!s) return true;
  if (BLOCKED_CHAR_RE.test(s)) return true;
  const sur = normalizeSurface(surnameChn ?? '');
  if (sur && (s === `${sur}氏` || s === `${sur}某`)) return true;
  return false;
}

/** @param {string} s */
const codePointLength = (s) => [...normalizeSurface(s)].length;

/**
 * @param {Set<string>} set
 * @param {string} surface
 * @param {string | null | undefined} surnameChn
 */
export function addCbdbPersonSearchString(set, surface, surnameChn) {
  if (isBlockedCbdbPersonString(surface, surnameChn)) return;
  addSearchString(set, surface);
}

/**
 * Build match strings for one person from `c_name_chn`, surname/mingzi, and typed alt rows.
 * Rules: [`cbdb/README.md`](./README.md) altname section (👤 signed 2026-07-05).
 *
 * @param {{
 *   c_name_chn: string;
 *   c_surname_chn?: string | null;
 *   c_mingzi_chn?: string | null;
 *   alts: { type: number; value: string }[];
 * }} person
 * @returns {string[]}
 */
export function personSearchStringsFromAlts(person) {
  const primary = normalizeSurface(person.c_name_chn);
  const surname = normalizeSurface(person.c_surname_chn ?? '');
  const mingzi = normalizeSurface(person.c_mingzi_chn ?? '');
  const primaryLen = codePointLength(primary);

  /** @type {Map<number, string[]>} */
  const byType = new Map();
  for (const { type, value } of person.alts) {
    if (ALTNAME_EXCLUDE.has(type)) continue;
    const v = normalizeSurface(value);
    if (!v) continue;
    const list = byType.get(type);
    if (list) list.push(v);
    else byType.set(type, [v]);
  }

  /** @type {Set<string>} */
  const out = new Set();
  addCbdbPersonSearchString(out, primary, surname);

  const longerThanPrimary = (alt) => codePointLength(alt) > primaryLen;
  const atLeastPrimaryLen = (alt) => codePointLength(alt) >= primaryLen;

  for (const alt of byType.get(3) ?? []) {
    if (longerThanPrimary(alt)) addCbdbPersonSearchString(out, alt, surname);
  }

  for (const alt of byType.get(4) ?? []) {
    if (surname) addCbdbPersonSearchString(out, surname + alt, surname);
    else addCbdbPersonSearchString(out, alt, surname);
  }

  for (const type of [5, 6]) {
    for (const alt of byType.get(type) ?? []) {
      if (longerThanPrimary(alt)) addCbdbPersonSearchString(out, alt, surname);
    }
  }

  for (const type of [8, 11, 14, 19, 20]) {
    for (const alt of byType.get(type) ?? []) {
      addCbdbPersonSearchString(out, alt, surname);
    }
  }

  for (const alt of byType.get(15) ?? []) {
    if (atLeastPrimaryLen(alt)) addCbdbPersonSearchString(out, alt, surname);
  }

  const secularSurnames = byType.get(12) ?? [];
  const secularNames = byType.get(13) ?? [];
  for (const secSur of secularSurnames) {
    for (const secName of secularNames) {
      addCbdbPersonSearchString(out, secSur + secName, surname);
    }
  }

  for (const alt of byType.get(18) ?? []) {
    const combined =
      mingzi && codePointLength(alt) <= codePointLength(surname) ? alt + mingzi : alt;
    addCbdbPersonSearchString(out, combined, surname);
  }

  return [...out];
}
