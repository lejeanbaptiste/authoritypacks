/** @param {import('./types.mjs').NdlPersonRaw} raw */
export function personSearchStringsFromRaw(raw) {
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
  return out;
}

  /** @param {string | undefined} value */
export function parseYear(value) {
  if (!value?.trim()) return undefined;
  const m = /^(-?\d{1,4})/.exec(value.trim());
  if (!m) return undefined;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) ? n : undefined;
}
