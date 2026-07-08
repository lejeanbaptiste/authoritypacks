/**
 * Japanese kana readings from Wikidata entities (P1814, ja-Hira, kana aliases).
 * Stored on raw rows for IME — not added to tagger search strings by default.
 */
import { katakanaToHiragana } from '../ndl/yomiReadings.mjs';

const KANA_RE = /[\u3040-\u309F\u30A0-\u30FF\u31F0-\u31FF]/u;

/** @param {string | undefined} text */
export function isKanaDominant(text) {
  if (!text?.trim()) return false;
  const chars = [...text.replace(/\s+/g, '')];
  if (chars.length === 0) return false;
  let kana = 0;
  for (const ch of chars) {
    if (KANA_RE.test(ch)) kana += 1;
  }
  return kana / chars.length >= 0.8;
}

/** Normalize kana strings to hiragana for IME lookup. */
export function hiraganaReading(text) {
  const t = text?.trim();
  if (!t || !KANA_RE.test(t)) return undefined;
  return katakanaToHiragana(t).replace(/\u3000/g, ' ').replace(/\s+/g, ' ').trim();
}

/** @param {unknown} entity @param {string} propertyId */
export function stringClaimValues(entity, propertyId) {
  const claims = entity?.claims?.[propertyId];
  if (!Array.isArray(claims)) return [];
  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  for (const claim of claims) {
    const val = claim?.mainsnak?.datavalue?.value;
    if (typeof val !== 'string') continue;
    const t = val.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/**
 * @param {unknown} entity
 * @param {string} [labelLang='ja']
 * @returns {{ nameInKana: string[], yomiHiragana: string } | undefined}
 */
export function kanaReadingsFromEntity(entity, labelLang = 'ja') {
  /** @type {string[]} */
  const sources = [];

  for (const value of stringClaimValues(entity, 'P1814')) sources.push(value);

  const jaHira = entity?.labels?.['ja-Hira']?.value;
  if (typeof jaHira === 'string') sources.push(jaHira);

  const jaKana = entity?.labels?.['ja-Kana']?.value;
  if (typeof jaKana === 'string') sources.push(jaKana);

  for (const entry of entity?.aliases?.[labelLang] ?? []) {
    if (entry?.value && isKanaDominant(entry.value)) sources.push(entry.value);
  }

  const primary = entity?.labels?.[labelLang]?.value;
  if (typeof primary === 'string' && isKanaDominant(primary)) sources.push(primary);

  const nameInKana = [];
  const seen = new Set();
  for (const source of sources) {
    const h = hiraganaReading(source);
    if (!h || seen.has(h)) continue;
    seen.add(h);
    nameInKana.push(h);
  }

  if (nameInKana.length === 0) return undefined;
  return { nameInKana, yomiHiragana: nameInKana[0] };
}
