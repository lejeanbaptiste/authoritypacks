import { isChineseNumeralOnly, normalizeSurface } from '../shared/normalize.mjs';

/** @param {import('./types.mjs').NdlWorkRaw} raw */
export function workSearchStringsFromRaw(raw) {
  const out = [];
  const seen = new Set();
  const add = (s) => {
    const t = normalizeSurface(s);
    if (!t || seen.has(t) || isChineseNumeralOnly(t)) return;
    seen.add(t);
    out.push(t);
  };

  add(raw.title);
  for (const v of raw.variants ?? []) add(v);
  return out;
}
