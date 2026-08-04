import { isAcceptableJapanesePersonName, sanitizeJapanesePersonSearchSurface } from '../shared/japanesePersonName.mjs';
import { normalizeSurface } from '../shared/normalize.mjs';

/**
 * NDL's person authority set contains Latin-only names, bare surnames, and
 * catalog stubs. The Japanese tag pack keeps only full names (or independent
 * dharma / art mononyms) with Japanese script, no Latin characters or Arabic
 * numerals, and at least one kanji.
 * @param {string | undefined} value
 * @param {{ heading?: string }} [opts]
 */
export function isUsableJapanesePersonName(value, opts = {}) {
  return isAcceptableJapanesePersonName(value, opts);
}

/** @param {import('./types.mjs').NdlPersonRaw} raw */
export function personSearchStringsFromRaw(raw) {
  const name = normalizeSurface(raw.name);
  if (!isAcceptableJapanesePersonName(name, { heading: raw.heading })) return [];
  const surface = sanitizeJapanesePersonSearchSurface(name);
  return surface ? [surface] : [];
}

/** @param {string | undefined} value */
export function parseYear(value) {
  if (!value?.trim()) return undefined;
  const m = /^(-?\d{1,4})/.exec(value.trim());
  if (!m) return undefined;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) ? n : undefined;
}
