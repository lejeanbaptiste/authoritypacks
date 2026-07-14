const JAPANESE_SCRIPT_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/u;
const LATIN_RE = /[A-Za-z]/u;
const DIGIT_RE = /\d/u;

/**
 * NDL's person authority set contains some Latin-only and catalog-like names.
 * The Japanese native-name tag pack keeps only names with Japanese script.
 * @param {string | undefined} value
 */
export function isUsableJapanesePersonName(value) {
  const name = value?.trim();
  if (!name || !JAPANESE_SCRIPT_RE.test(name)) return false;
  if (LATIN_RE.test(name) || DIGIT_RE.test(name)) return false;
  return true;
}

/** @param {import('./types.mjs').NdlPersonRaw} raw */
export function personSearchStringsFromRaw(raw) {
  return isUsableJapanesePersonName(raw.name) ? [raw.name.trim()] : [];
}

  /** @param {string | undefined} value */
export function parseYear(value) {
  if (!value?.trim()) return undefined;
  const m = /^(-?\d{1,4})/.exec(value.trim());
  if (!m) return undefined;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) ? n : undefined;
}
