import { addYomiSearchStrings } from './yomiReadings.mjs';

/** @param {import('./types.mjs').NdlPlaceRaw} raw */
export function placeSearchStringsFromRaw(raw) {
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

  // Mention form without prefecture disambiguator: 袖崎村 (山形県) → 袖崎村
  const paren = /^(.*?) \([^)]+\)$/.exec(raw.name ?? '');
  if (paren?.[1]) add(paren[1].trim());

  addYomiSearchStrings(raw, add);
  return out;
}
