/**
 * Build person search strings from Wikidata labels/aliases using CBDB-equivalent rules.
 * Wikidata has no altname type codes — heuristics mirror cbdb/personAltNames.mjs v1 policy.
 *
 * Japanese packs (`language: 'ja'`) additionally require a full name or dharma/art
 * mononym, and strip kana readings / spaced / joke aliases from tagger strings.
 *
 * @see cbdb/README.md
 * @see shared/personStringPolicy.mjs
 * @see shared/japanesePersonName.mjs
 * @see docs/wikidata-output-contract.md
 */
import {
  addPersonSearchString,
  codePointLength,
  inferFamilyNameFromLabel,
  isBlockedPersonString,
} from '../shared/personStringPolicy.mjs';
import {
  isAcceptableJapanesePersonName,
  sanitizeJapanesePersonSearchSurface,
} from '../shared/japanesePersonName.mjs';
import { normalizeSurface } from '../shared/normalize.mjs';

/**
 * @param {{
 *   primaryLabel: string;
 *   aliases?: string[];
 *   familyName?: string | null;
 *   givenName?: string | null;
 *   language?: string;
 * }} person
 * @returns {string[]}
 */
export function personSearchStringsFromWikidata(person) {
  const primary = normalizeSurface(person.primaryLabel);
  if (!primary) return [];

  const isJa = person.language === 'ja' || person.language === 'ja-japan';
  const familyName =
    normalizeSurface(person.familyName ?? '') ||
    (isJa ? '' : inferFamilyNameFromLabel(primary));
  const givenName = normalizeSurface(person.givenName ?? '');

  if (isJa) {
    return japanesePersonSearchStrings({
      primary,
      aliases: person.aliases ?? [],
      familyName,
      givenName,
    });
  }

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
 * @param {{
 *   primary: string;
 *   aliases: string[];
 *   familyName: string;
 *   givenName: string;
 * }} opts
 */
function japanesePersonSearchStrings(opts) {
  const { primary, aliases, familyName, givenName } = opts;
  const nameOpts = { familyName, givenName };

  /** @type {Set<string>} */
  const out = new Set();

  const addJa = (raw) => {
    const sanitized = sanitizeJapanesePersonSearchSurface(raw);
    if (!sanitized) return;
    if (!isAcceptableJapanesePersonName(sanitized, nameOpts)) return;
    if (isBlockedPersonString(sanitized, familyName || undefined)) return;
    out.add(sanitized);
  };

  // Primary must itself be a full name or dharma/art mononym — otherwise drop
  // the entity (aliases alone are not enough to invent an identity).
  if (!isAcceptableJapanesePersonName(primary, nameOpts)) return [];
  addJa(primary);
  if (out.size === 0) return [];

  const primaryLen = codePointLength([...out][0]);
  const seenAliases = new Set();
  for (const raw of aliases) {
    const alias = normalizeSurface(raw);
    if (!alias || alias === primary || seenAliases.has(alias)) continue;
    seenAliases.add(alias);
    const sanitized = sanitizeJapanesePersonSearchSurface(alias);
    if (!sanitized || sanitized === primary) continue;
    if (codePointLength(sanitized) <= primaryLen) continue;
    addJa(sanitized);
  }

  return [...out];
}

/**
 * Compare raw Wikidata strings vs filtered pack strings (for W1 reports).
 * @param {{
 *   primaryLabel: string;
 *   aliases?: string[];
 *   familyName?: string | null;
 *   givenName?: string | null;
 *   language?: string;
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
