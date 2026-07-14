import { addYomiSearchStrings } from './yomiReadings.mjs';

const KANJI_RE = /[一-鿿]/u;
const LATIN_RE = /[A-Za-z]/u;
const DIGIT_RE = /\d/u;

/**
 * Filter out organizations with Latin characters, Arabic numerals, or without kanji.
 * Excludes modern/informal/foreign entities; keeps traditional Japanese organizations.
 */
function isUsableOrgName(value) {
  const name = value?.trim();
  if (!name) return false;
  if (LATIN_RE.test(name) || DIGIT_RE.test(name)) return false;
  if (!KANJI_RE.test(name)) return false;
  return true;
}

/** @param {import('./types.mjs').NdlOrgRaw} raw */
export function orgSearchStringsFromRaw(raw) {
  if (!isUsableOrgName(raw.name)) return [];

  const out = [];
  const seen = new Set();
  const add = (s) => {
    const t = s?.trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };

  add(raw.name);
  if (raw.heading && raw.heading !== raw.name) add(raw.heading);

  // Mention form without location disambiguator: 東大寺 (奈良市) → 東大寺
  const paren = /^(.*?) \([^)]+\)$/.exec(raw.name ?? '');
  if (paren?.[1]) add(paren[1].trim());

  addYomiSearchStrings(raw, add);
  return out;
}
