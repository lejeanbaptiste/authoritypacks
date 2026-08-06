/**
 * Search strings for non-person Wikidata kinds.
 */

import {
  addSearchString,
  containsLatinLetters,
  normalizeSurface,
} from '../shared/normalize.mjs';

/** US/elsewhere admin units that only have a Japanese label translation. */
const FOREIGN_ADMIN_SUFFIX_RE =
  /(?:タウンシップ|郡区|パリッシュ|コミューン|ムニシピオ|ボロー)$/u;

/** School names with no prefecture/city disambiguator — extremely ambiguous. */
const SCHOOL_SUFFIX_RE = /(?:小学校|中学校|高等学校|高等専門学校|専門学校|幼稚園)$/u;
const GEO_DISAMBIG_RE = /[都道府県市区町村]/u;

/** Country / continent style labels that are tag bait as aliases. */
const GEO_GENERIC_RE =
  /^(?:日本|中国|韓国|朝鮮|アメリカ|イギリス|英国|米国|フランス|ドイツ|ロシア|イタリア|スペイン|カナダ|オーストラリア|インド|ブラジル|タイ|ベトナム|フィリピン|インドネシア|マレーシア|シンガポール|ヨーロッパ|アジア|アフリカ|本州|九州|四国|北海道)$/u;

/**
 * @param {string} surface
 * @param {'place' | 'org' | 'work'} kind
 * @param {{ script?: string }} [opts]
 */
export function isBlockedKindSearchString(surface, kind, opts = {}) {
  const s = normalizeSurface(surface);
  if (!s) return true;
  if (containsLatinLetters(s)) return true;
  if (FOREIGN_ADMIN_SUFFIX_RE.test(s)) return true;
  if (GEO_GENERIC_RE.test(s) && kind !== 'place') return true;
  if (kind === 'org' && SCHOOL_SUFFIX_RE.test(s) && !GEO_DISAMBIG_RE.test(s)) {
    // Keep well-known national universities / named institutions with longer stems.
    const stem = s.replace(SCHOOL_SUFFIX_RE, '');
    if ([...stem].length <= 4) return true;
  }
  if (kind === 'org' && /^(?:株式会社|有限会社|合同会社|財団法人|社団法人)$/u.test(s)) {
    return true;
  }
  return false;
}

/**
 * @param {{ primaryLabel?: string, aliases?: string[] }} raw
 * @param {{ script?: string, kind?: 'place' | 'org' | 'work' }} [opts]
 */
export function kindSearchStringsFromWikidata(raw, opts = {}) {
  const kind = opts.kind ?? 'place';
  /** @type {Set<string>} */
  const set = new Set();
  const add = (surface) => {
    const s = normalizeSurface(surface);
    if (!s || isBlockedKindSearchString(s, kind, opts)) return;
    addSearchString(set, s, opts);
  };
  if (raw.primaryLabel) add(raw.primaryLabel);
  for (const alias of raw.aliases ?? []) add(alias);
  return [...set];
}

/** @param {Parameters<typeof kindSearchStringsFromWikidata>[0]} raw */
export function workSearchStringsFromWikidata(raw) {
  return kindSearchStringsFromWikidata(raw, { kind: 'work' });
}
