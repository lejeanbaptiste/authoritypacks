/**
 * Build person search strings from Wikidata labels/aliases using CBDB-equivalent rules.
 * Wikidata has no altname type codes — heuristics mirror cbdb/personAltNames.mjs v1 policy.
 *
 * @see cbdb/README.md
 * @see shared/personStringPolicy.mjs
 */
import {
  addPersonSearchString,
  codePointLength,
  inferFamilyNameFromLabel,
  isBlockedPersonString,
} from '../shared/personStringPolicy.mjs';
import { normalizeSurface } from '../shared/normalize.mjs';

/**
 * @param {{
 *   primaryLabel: string;
 *   aliases?: string[];
 *   familyName?: string | null;
 *   givenName?: string | null;
 * }} person
 * @returns {string[]}
 */
export function personSearchStringsFromWikidata(person) {
  const primary = normalizeSurface(person.primaryLabel);
  if (!primary) return [];

  const familyName =
    normalizeSurface(person.familyName ?? '') ||
    inferFamilyNameFromLabel(primary);
  const primaryLen = codePointLength(primary);

  /** @type {Set<string>} */
  const out = new Set();
  addPersonSearchString(out, primary, familyName);

  const longerThanPrimary = (alt) => codePointLength(alt) > primaryLen;

  const seenAliases = new Set();
  for (const raw of person.aliases ?? []) {
    const alias = normalizeSurface(raw);
    if (!alias || alias === primary || seenAliases.has(alias)) continue;
    seenAliases.add(alias);

    if (isBlockedPersonString(alias, familyName)) continue;

    // Retain independently recorded full aliases. Do not synthesize surname
    // + courtesy-name combinations: they can be ambiguous in authority lookup.
    if (longerThanPrimary(alias)) {
      addPersonSearchString(out, alias, familyName);
    }
  }

  return [...out];
}

/**
 * Compare raw Wikidata strings vs filtered pack strings (for W1 reports).
 * @param {{
 *   primaryLabel: string;
 *   aliases?: string[];
 *   familyName?: string | null;
 * }} person
 */
export function summarizeWikidataNameFilter(person) {
  const raw = new Set(
    [person.primaryLabel, ...(person.aliases ?? [])]
      .map((s) => normalizeSurface(s))
      .filter(Boolean),
  );
  const filtered = personSearchStringsFromWikidata(person);
  const dropped = [...raw].filter((s) => !filtered.includes(s));
  return { rawCount: raw.size, filteredCount: filtered.length, filtered, dropped };
}
