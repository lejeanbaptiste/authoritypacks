import { isValidSearchString, normalizeSurface } from '../shared/normalize.mjs';
import {
  addPersonSearchString,
  codePointLength,
  isBlockedPersonString,
} from '../shared/personStringPolicy.mjs';
import { stripFamilyPrefixFromCourtesyName } from '../norbert/personNames.mjs';
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
 * Build typed name entries + phase-1 search strings for one person.
 *
 * - **`names`**: every typed form LJB may store on entities.xml at link time,
 *   including bare 姓 / 名 / 字 and short 號/諡 that fail the phase-1 length
 *   gates (min length 1 code point for those short forms).
 * - **`searchStrings`**: phase-1 matcher only — same inclusion/length rules as
 *   before (min 2, 姓+字 not bare 字, long 別號/諡號 only, …).
 *
 * Rules: [`cbdb/README.md`](./README.md) altname section.
 *
 * Dedup within each list: first type a surface qualifies under wins.
 *
 * @param {{
 *   c_name_chn: string;
 *   c_surname_chn?: string | null;
 *   c_mingzi_chn?: string | null;
 *   alts: { type: number; value: string }[];
 * }} person
 * @returns {{
 *   names: { text: string, type: string }[],
 *   searchStrings: string[],
 * }}
 */
export function buildPersonNamesFromAlts(person) {
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

  /** @type {Map<string, string>} text -> ljbType */
  const searchEntries = new Map();
  /** @type {Map<string, string>} text -> ljbType (superset of search + short forms) */
  const nameEntries = new Map();

  /**
   * @param {string} surface
   * @param {string} ljbType
   * @param {{ minLength?: number, search?: boolean }} [opts]
   */
  const add = (surface, ljbType, opts = {}) => {
    const { minLength = 2, search = true, names = true } = opts;
    if (isBlockedPersonString(surface, surname)) return;
    const normalized = normalizeSurface(surface);
    if (!isValidSearchString(normalized, { minLength })) return;
    if (names && !nameEntries.has(normalized)) nameEntries.set(normalized, ljbType);
    if (search && !searchEntries.has(normalized) && isValidSearchString(normalized)) {
      searchEntries.set(normalized, ljbType);
    }
  };

  const longerThanPrimary = (alt) => codePointLength(alt) > primaryLen;
  const atLeastPrimaryLen = (alt) => codePointLength(alt) >= primaryLen;

  // --- Phase-1 (and names[]) forms ---
  add(primary, 'primary');

  for (const alt of byType.get(3) ?? []) {
    if (longerThanPrimary(alt)) add(alt, CBDB_NAME_TYPE_MAP.get(3));
  }

  for (const alt of byType.get(4) ?? []) {
    // Matcher keeps 姓+字 for phase-1 tagging; typed courtesy names store bare 字 only
    // so entity intake never has to strip a synthetic composite. CBDB ALTNAME values
    // sometimes already include 姓 — strip before storing or synthesizing.
    const bare = stripFamilyPrefixFromCourtesyName(alt, surname ? [surname] : []);
    add(surname ? surname + bare : bare, CBDB_NAME_TYPE_MAP.get(4), { names: false });
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

  // --- Short forms: names[] only (phase-2 / Never at link time) ---
  // Bare 姓 / 名 from BIOG_MAIN.
  if (surname) add(surname, 'family', { minLength: 1, search: false });
  if (mingzi) add(mingzi, 'given', { minLength: 1, search: false });

  // Bare 字 (type 4 component). Strip leading 姓 when the ALTNAME row already
  // stored 姓+字 (common in CBDB dumps).
  for (const alt of byType.get(4) ?? []) {
    const bare = stripFamilyPrefixFromCourtesyName(alt, surname ? [surname] : []);
    add(bare, CBDB_NAME_TYPE_MAP.get(4), { minLength: 1, search: false });
  }

  // Short 別名 / 別號 / 諡號 / 尊號 that failed the phase-1 length gate.
  for (const alt of byType.get(3) ?? []) {
    if (!longerThanPrimary(alt)) {
      add(alt, CBDB_NAME_TYPE_MAP.get(3), { minLength: 1, search: false });
    }
  }
  for (const type of [5, 6]) {
    for (const alt of byType.get(type) ?? []) {
      if (!longerThanPrimary(alt)) {
        add(alt, CBDB_NAME_TYPE_MAP.get(type), { minLength: 1, search: false });
      }
    }
  }
  for (const alt of byType.get(15) ?? []) {
    if (!atLeastPrimaryLen(alt)) {
      add(alt, CBDB_NAME_TYPE_MAP.get(15), { minLength: 1, search: false });
    }
  }

  return {
    names: [...nameEntries].map(([text, type]) => ({ text, type })),
    searchStrings: [...searchEntries.keys()],
  };
}

/**
 * All typed names for entities.xml ingestion (includes bare short forms).
 * @param {Parameters<typeof buildPersonNamesFromAlts>[0]} person
 */
export function personNameEntriesFromAlts(person) {
  return buildPersonNamesFromAlts(person).names;
}

/**
 * Phase-1 matcher strings only (no bare 字 / 名 / 姓 / short 號).
 * @param {Parameters<typeof buildPersonNamesFromAlts>[0]} person
 */
export function personSearchStringsFromAlts(person) {
  return buildPersonNamesFromAlts(person).searchStrings;
}

// Re-export for tests that import codePointLength via this module
export { codePointLength } from '../shared/personStringPolicy.mjs';
