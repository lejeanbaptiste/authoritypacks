import { isValidSearchString, normalizeSurface } from '../shared/normalize.mjs';
import {
  codePointLength,
  inferFamilyNameFromLabel,
  isBlockedPersonString,
} from '../shared/personStringPolicy.mjs';
import { NAME_TYPE_EXCLUDE, NORBERT_NAME_TYPE_MAP } from './constants.mjs';

/**
 * Build typed name entries for one Norbert person.
 *
 * Rules mirror CBDB where the underlying name category matches; see
 * `norbert/README.md`.
 *
 * @param {{
 *   can_name: string;
 *   names: { type: number; value: string }[];
 * }} person
 * @returns {{ text: string, type: string }[]}
 */
export function personNameEntriesFromNorbert(person) {
  const primary = normalizeSurface(person.can_name);
  const surname =
    normalizeSurface(
      person.names.find((n) => n.type === 0)?.value ??
        person.names.find((n) => n.type === 7)?.value ??
        '',
    ) || inferFamilyNameFromLabel(primary);
  const given = normalizeSurface(person.names.find((n) => n.type === 1)?.value ?? '');
  const primaryLen = codePointLength(primary);

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
    if (!ljbType || isBlockedPersonString(surface, surname)) return;
    const normalized = normalizeSurface(surface);
    if (!isValidSearchString(normalized) || entries.has(normalized)) return;
    entries.set(normalized, ljbType);
  };

  add(primary, 'primary');

  const longerThanPrimary = (alt) => codePointLength(alt) > primaryLen;
  const atLeastPrimaryLen = (alt) => codePointLength(alt) >= primaryLen;

  for (const alt of byType.get(0) ?? []) add(alt, NORBERT_NAME_TYPE_MAP.get(0));
  for (const alt of byType.get(1) ?? []) add(alt, NORBERT_NAME_TYPE_MAP.get(1));

  for (const alt of byType.get(3) ?? []) {
    if (longerThanPrimary(alt)) add(alt, NORBERT_NAME_TYPE_MAP.get(3));
  }

  for (const alt of byType.get(2) ?? []) {
    add(surname ? surname + alt : alt, NORBERT_NAME_TYPE_MAP.get(2));
  }

  for (const type of [4, 9]) {
    for (const alt of byType.get(type) ?? []) {
      if (longerThanPrimary(alt)) add(alt, NORBERT_NAME_TYPE_MAP.get(type));
    }
  }

  for (const type of [10, 13, 17]) {
    for (const alt of byType.get(type) ?? []) {
      add(alt, NORBERT_NAME_TYPE_MAP.get(type));
    }
  }

  for (const alt of byType.get(14) ?? []) {
    if (atLeastPrimaryLen(alt)) add(alt, NORBERT_NAME_TYPE_MAP.get(14));
  }

  for (const alt of byType.get(15) ?? []) add(alt, NORBERT_NAME_TYPE_MAP.get(15));
  for (const alt of byType.get(16) ?? []) add(alt, NORBERT_NAME_TYPE_MAP.get(16));

  const secularSurnames = byType.get(11) ?? [];
  const secularNames = byType.get(12) ?? [];
  for (const secSur of secularSurnames) {
    for (const secName of secularNames) {
      add(secSur + secName, NORBERT_NAME_TYPE_MAP.get(11));
    }
  }

  for (const alt of byType.get(7) ?? []) {
    const combined =
      given && codePointLength(alt) <= codePointLength(surname) ? alt + given : alt;
    add(combined, NORBERT_NAME_TYPE_MAP.get(7));
  }

  for (const alt of byType.get(8) ?? []) add(alt, NORBERT_NAME_TYPE_MAP.get(8));

  return [...entries].map(([text, type]) => ({ text, type }));
}

/**
 * @param {Parameters<typeof personNameEntriesFromNorbert>[0]} person
 * @returns {string[]}
 */
export function personSearchStringsFromNorbert(person) {
  return personNameEntriesFromNorbert(person).map((entry) => entry.text);
}
