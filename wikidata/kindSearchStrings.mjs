/**
 * Search strings for non-person Wikidata kinds.
 */

import { addSearchString } from '../shared/normalize.mjs';

/**
 * @param {{ primaryLabel?: string, aliases?: string[] }} raw
 * @param {{ script?: string }} [opts]
 */
export function kindSearchStringsFromWikidata(raw, opts = {}) {
  /** @type {Set<string>} */
  const set = new Set();
  if (raw.primaryLabel) addSearchString(set, raw.primaryLabel, opts);
  for (const alias of raw.aliases ?? []) addSearchString(set, alias, opts);
  return [...set];
}

/** @param {Parameters<typeof kindSearchStringsFromWikidata>[0]} raw */
export function workSearchStringsFromWikidata(raw) {
  return kindSearchStringsFromWikidata(raw);
}
