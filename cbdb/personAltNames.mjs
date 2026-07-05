import { addSearchString, normalizeSurface } from '../shared/normalize.mjs';
import {
  addPersonSearchString,
  codePointLength,
  isBlockedPersonString,
} from '../shared/personStringPolicy.mjs';
import { ALTNAME_EXCLUDE } from './constants.mjs';

/** @deprecated Use isBlockedPersonString from shared/personStringPolicy.mjs */
export function isBlockedCbdbPersonString(surface, surnameChn) {
  return isBlockedPersonString(surface, surnameChn);
}

/**
 * @param {Set<string>} set
 * @param {string} surface
 * @param {string | null | undefined} surnameChn
 */
export function addCbdbPersonSearchString(set, surface, surnameChn) {
  addPersonSearchString(set, surface, surnameChn);
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

// Re-export for tests that import codePointLength via this module
export { codePointLength } from '../shared/personStringPolicy.mjs';
