/**
 * Parse NDL ja-kana transcriptions into search/IME-friendly readings.
 * NDL stores katakana on xl:prefLabel / xl:altLabel (lang ja-kana).
 */

const KANA_RE = /[\u3040-\u309F\u30A0-\u30FF\u31F0-\u31FF]/u;

/** Katakana → hiragana (IME users often type either script). */
export function katakanaToHiragana(text) {
  return text
    .replace(/[\u30A1-\u30F6\u30FD-\u30FE]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/\u30F4/g, 'ゔ');
}

/** Drop life-date fragments and split NDL comma/space-separated kana tokens. */
export function kanaSegmentsFromTranscription(raw) {
  if (!raw?.trim()) return [];
  const withoutDates = raw.replace(/\d{1,4}(-\d{1,4})?/g, ' ');
  return withoutDates
    .split(/[\s,、，]+/)
    .map((s) => s.trim())
    .filter((s) => s && KANA_RE.test(s));
}

/**
 * @typedef {Object} NdlYomiSource
 * @property {string} [yomi] prefLabel ja-kana transcription
 * @property {string[]} [yomiAlt] altLabel ja-kana transcriptions
 */

/**
 * @param {NdlYomiSource} src
 * @returns {{
 *   katakana: string[],
 *   hiragana: string[],
 *   primaryKatakana?: string,
 *   primaryHiragana?: string,
 * }}
 */
export function yomiReadingsFromRaw(src) {
  /** @type {string[]} */
  const sources = [];
  if (src.yomi) sources.push(src.yomi);
  if (src.yomiAlt?.length) sources.push(...src.yomiAlt);

  const kataSeen = new Set();
  const hiraSeen = new Set();
  /** @type {string[]} */
  const katakana = [];
  /** @type {string[]} */
  const hiragana = [];

  const addKata = (s) => {
    const t = s?.trim();
    if (!t || !KANA_RE.test(t) || kataSeen.has(t)) return;
    kataSeen.add(t);
    katakana.push(t);
    const h = katakanaToHiragana(t);
    if (h && !hiraSeen.has(h)) {
      hiraSeen.add(h);
      hiragana.push(h);
    }
  };

  for (const source of sources) {
    const segments = kanaSegmentsFromTranscription(source);
    if (segments.length === 0) continue;
    addKata(segments.join(' '));
    addKata(segments.join(''));
    for (const seg of segments) addKata(seg);
  }

  const primaryKatakana = katakana[0];
  const primaryHiragana = primaryKatakana ? katakanaToHiragana(primaryKatakana) : undefined;
  return { katakana, hiragana, primaryKatakana, primaryHiragana };
}

/**
 * @param {NdlYomiSource} src
 * @param {(s: string) => void} add
 */
export function addYomiSearchStrings(src, add) {
  const { katakana, hiragana } = yomiReadingsFromRaw(src);
  for (const s of katakana) add(s);
  for (const s of hiragana) add(s);
}
