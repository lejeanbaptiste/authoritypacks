import { isValidSearchString, normalizeSurface } from '../shared/normalize.mjs';
import {
  codePointLength,
  inferFamilyNameFromLabel,
  isBlockedPersonString,
  isMissingNameToken,
} from '../shared/personStringPolicy.mjs';
import { NAME_TYPE_EXCLUDE, NORBERT_NAME_TYPE_MAP } from './constants.mjs';

/**
 * Name types where a leading 姓 is a composite display form, not a distinct name.
 * Matches leaf-writer `FAMILY_PREFIX_STRIP_TYPES` / `normalizeTypedNamesForIntake`.
 */
export const FAMILY_PREFIX_STRIP_TYPES = new Set(['courtesy', 'art', 'dharma']);

/**
 * If a courtesy name begins with a known family name, return the bare 字.
 * Authority rows sometimes store 姓+字 as the courtesy value; keep the bare form.
 *
 * @param {string} text
 * @param {string[]} familyNames
 * @returns {string}
 */
export function stripFamilyPrefixFromCourtesyName(text, familyNames) {
  const normalizedText = normalizeSurface(text);
  if (!normalizedText) return normalizedText;
  let bestPrefix = '';
  for (const familyName of familyNames) {
    const normalizedFamily = normalizeSurface(familyName);
    if (
      normalizedFamily.length > bestPrefix.length &&
      normalizedText.length > normalizedFamily.length &&
      normalizedText.startsWith(normalizedFamily)
    ) {
      bestPrefix = normalizedFamily;
    }
  }
  return bestPrefix ? normalizedText.slice(bestPrefix.length) : normalizedText;
}

/**
 * After 字/號 cleaning: strip family prefixes from courtesy/art/dharma, then
 * collapse duplicate texts so 安處厚 + 處厚 → one 處厚 entry.
 * Does not touch searchStrings (phase-1 still wants 姓+字 for tagging).
 *
 * @param {{ text: string, type: string, lang?: string }[]} names
 * @param {string[]} [extraFamilyNames]
 * @returns {{ text: string, type: string, lang?: string }[]}
 */
export function collapseTypedNamesAfterZiClean(names, extraFamilyNames = []) {
  if (!Array.isArray(names) || names.length === 0) return names ?? [];

  const familyNames = [
    ...extraFamilyNames,
    ...names.filter((name) => name.type === 'family').map((name) => name.text),
  ]
    .map((name) => normalizeSurface(name))
    .filter(Boolean);

  /** @type {Map<string, { text: string, type: string, lang?: string }>} */
  const byText = new Map();
  for (const name of names) {
    let text = normalizeSurface(name.text);
    if (!text) continue;
    if (FAMILY_PREFIX_STRIP_TYPES.has(name.type)) {
      text = stripFamilyPrefixFromCourtesyName(text, familyNames);
      if (!text) continue;
    }
    if (!byText.has(text)) {
      byText.set(text, {
        text,
        type: name.type,
        ...(name.lang ? { lang: name.lang } : {}),
      });
    }
  }
  return [...byText.values()];
}

/**
 * @param {{
 *   can_name: string;
 *   names: { type: number; value: string }[];
 * }} person
 * @param {{ forTagging?: boolean }} [options]
 *   When `forTagging` is true, apply tag-bomb filters (min length, block list,
 *   longer-than-primary heuristics). Intake / disambiguation must leave this false.
 * @returns {{ text: string, type: string }[]}
 */
export function personNameEntriesFromNorbert(person, options = {}) {
  const forTagging = options.forTagging === true;
  const primary = normalizeSurface(person.can_name);
  const surname =
    normalizeSurface(
      person.names.find((n) => n.type === 0)?.value ??
        person.names.find((n) => n.type === 7)?.value ??
        '',
    ) || inferFamilyNameFromLabel(primary);
  const primaryLen = codePointLength(primary);
  const familyNames = [surname].filter(Boolean);

  /** @type {Map<number, string[]>} */
  const byType = new Map();
  for (const { type, value } of person.names) {
    if (NAME_TYPE_EXCLUDE.has(type)) continue;
    const v = normalizeSurface(value);
    if (!v) continue;
    const list = byType.get(type);
    if (list) list.push(v);
    else byType.set(type, [v]);
  }

  /** @type {Map<string, string>} */
  const entries = new Map();
  const add = (surface, grognardType) => {
    if (!grognardType) return;
    const normalized = normalizeSurface(surface);
    if (!normalized || entries.has(normalized)) return;
    // "nan" (and empty) is never a name — drop even from intake names[].
    if (isMissingNameToken(normalized)) return;
    if (forTagging) {
      if (isBlockedPersonString(normalized, surname)) return;
      if (!isValidSearchString(normalized)) return;
    }
    entries.set(normalized, grognardType);
  };

  if (!isMissingNameToken(primary)) add(primary, 'primary');

  const longerThanPrimary = (alt) => codePointLength(alt) > primaryLen;
  const atLeastPrimaryLen = (alt) => codePointLength(alt) >= primaryLen;

  for (const alt of byType.get(0) ?? []) {
    add(alt, NORBERT_NAME_TYPE_MAP.get(0));
    familyNames.push(alt);
  }
  for (const alt of byType.get(1) ?? []) add(alt, NORBERT_NAME_TYPE_MAP.get(1));

  for (const alt of byType.get(3) ?? []) {
    if (!forTagging || longerThanPrimary(alt)) add(alt, NORBERT_NAME_TYPE_MAP.get(3));
  }

  for (const alt of byType.get(2) ?? []) {
    const bare = stripFamilyPrefixFromCourtesyName(alt, familyNames);
    if (bare) add(bare, NORBERT_NAME_TYPE_MAP.get(2));
  }

  for (const type of [4, 9]) {
    for (const alt of byType.get(type) ?? []) {
      if (!forTagging || longerThanPrimary(alt)) add(alt, NORBERT_NAME_TYPE_MAP.get(type));
    }
  }

  for (const type of [10, 13, 17]) {
    for (const alt of byType.get(type) ?? []) {
      add(alt, NORBERT_NAME_TYPE_MAP.get(type));
    }
  }

  for (const alt of byType.get(14) ?? []) {
    if (!forTagging || atLeastPrimaryLen(alt)) add(alt, NORBERT_NAME_TYPE_MAP.get(14));
  }

  for (const alt of byType.get(15) ?? []) add(alt, NORBERT_NAME_TYPE_MAP.get(15));
  for (const alt of byType.get(16) ?? []) add(alt, NORBERT_NAME_TYPE_MAP.get(16));

  for (const type of [7, 11, 12]) {
    for (const alt of byType.get(type) ?? []) add(alt, NORBERT_NAME_TYPE_MAP.get(type));
  }

  for (const alt of byType.get(8) ?? []) add(alt, NORBERT_NAME_TYPE_MAP.get(8));

  return collapseTypedNamesAfterZiClean(
    [...entries].map(([text, type]) => ({ text, type })),
    familyNames,
  );
}

/**
 * Tag-bomb surfaces only (min length, block list, length-vs-primary gates).
 * Bare 姓/名 stay in intake `names[]` only — same policy as CBDB.
 * @param {Parameters<typeof personNameEntriesFromNorbert>[0]} person
 * @returns {string[]}
 */
export function personSearchStringsFromNorbert(person) {
  return personNameEntriesFromNorbert(person, { forTagging: true })
    .filter((entry) => entry.type !== 'family' && entry.type !== 'given')
    .map((entry) => entry.text);
}
