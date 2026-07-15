import { isValidSearchString, normalizeSurface } from '../shared/normalize.mjs';
import {
  addPersonSearchString,
  codePointLength,
  isBlockedPersonString,
} from '../shared/personStringPolicy.mjs';
import { ALTNAME_EXCLUDE, CBDB_NAME_TYPE_MAP } from './constants.mjs';

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
 * Build (text, LJB name-type) entries for one person from `c_name_chn`,
 * surname/mingzi, and typed alt rows — the single source of truth for both
 * {@link personSearchStringsFromAlts} (flat strings, for the matcher) and the
 * `names` field on the compiled candidate (typed, for LJB's entities.xml).
 * Rules: [`cbdb/README.md`](./README.md) altname section (👤 signed 2026-07-05).
 *
 * Dedup matches the original Set-based behavior: the first type a surface
 * form qualifies under wins; later occurrences of the same normalized string
 * are dropped rather than reclassified.
 *
 * @param {{
 *   c_name_chn: string;
 *   c_surname_chn?: string | null;
 *   c_mingzi_chn?: string | null;
 *   alts: { type: number; value: string }[];
 * }} person
 * @returns {{ text: string, type: string }[]}
 */
export function personNameEntriesFromAlts(person) {
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

  /** @type {Map<string, string>} text -> ljbType, first-qualifying-type wins */
  const entries = new Map();
  const add = (surface, ljbType) => {
    if (isBlockedPersonString(surface, surname)) return;
    const normalized = normalizeSurface(surface);
    if (!isValidSearchString(normalized) || entries.has(normalized)) return;
    entries.set(normalized, ljbType);
  };

  add(primary, 'primary');

  const longerThanPrimary = (alt) => codePointLength(alt) > primaryLen;
  const atLeastPrimaryLen = (alt) => codePointLength(alt) >= primaryLen;

  for (const alt of byType.get(3) ?? []) {
    if (longerThanPrimary(alt)) add(alt, CBDB_NAME_TYPE_MAP.get(3));
  }

  for (const alt of byType.get(4) ?? []) {
    add(surname ? surname + alt : alt, CBDB_NAME_TYPE_MAP.get(4));
  }

  for (const type of [5, 6]) {
    for (const alt of byType.get(type) ?? []) {
      if (longerThanPrimary(alt)) add(alt, CBDB_NAME_TYPE_MAP.get(type));
    }
  }

  for (const type of [8, 11, 14, 19, 20]) {
    for (const alt of byType.get(type) ?? []) {
      add(alt, CBDB_NAME_TYPE_MAP.get(type));
    }
  }

  for (const alt of byType.get(15) ?? []) {
    if (atLeastPrimaryLen(alt)) add(alt, CBDB_NAME_TYPE_MAP.get(15));
  }

  const secularSurnames = byType.get(12) ?? [];
  const secularNames = byType.get(13) ?? [];
  for (const secSur of secularSurnames) {
    for (const secName of secularNames) {
      add(secSur + secName, CBDB_NAME_TYPE_MAP.get(12));
    }
  }

  for (const alt of byType.get(18) ?? []) {
    const combined =
      mingzi && codePointLength(alt) <= codePointLength(surname) ? alt + mingzi : alt;
    add(combined, CBDB_NAME_TYPE_MAP.get(18));
  }

  return [...entries].map(([text, type]) => ({ text, type }));
}

/**
 * Flat match strings for one person (matcher input) — same rules as
 * {@link personNameEntriesFromAlts}, stripped of type.
 *
 * @param {Parameters<typeof personNameEntriesFromAlts>[0]} person
 * @returns {string[]}
 */
export function personSearchStringsFromAlts(person) {
  return personNameEntriesFromAlts(person).map((entry) => entry.text);
}

// Re-export for tests that import codePointLength via this module
export { codePointLength } from '../shared/personStringPolicy.mjs';
