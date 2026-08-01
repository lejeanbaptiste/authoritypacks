import { isValidSearchString, normalizeSurface } from '../shared/normalize.mjs';
import {
  codePointLength,
  inferFamilyNameFromLabel,
  isBlockedPersonString,
} from '../shared/personStringPolicy.mjs';
import { NAME_TYPE_EXCLUDE, NORBERT_NAME_TYPE_MAP } from './constants.mjs';

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
  const add = (surface, ljbType) => {
    if (!ljbType) return;
    const normalized = normalizeSurface(surface);
    if (!normalized || entries.has(normalized)) return;
    if (forTagging) {
      if (isBlockedPersonString(normalized, surname)) return;
      if (!isValidSearchString(normalized)) return;
    }
    entries.set(normalized, ljbType);
  };

  add(primary, 'primary');

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

  return [...entries].map(([text, type]) => ({ text, type }));
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
