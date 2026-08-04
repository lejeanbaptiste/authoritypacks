/**
 * Japanese person-name policy for NDL + Wikidata JA packs.
 *
 * Tag packs keep only a full personal name (family+given, possibly compacted)
 * or an independent dharma / religious / art mononym. Bare surnames,
 * single-kanji labels, and catalog stubs with occupation-only headings are out.
 */
import { codePointLength, isMissingNameToken } from './personStringPolicy.mjs';
import { normalizeSurface } from './normalize.mjs';

const KANJI_RE = /[\u4e00-\u9fff]/u;
const LATIN_RE = /[A-Za-z]/u;
const DIGIT_RE = /\d/u;
const KANA_ONLY_RE = /^[\u3040-\u309f\u30a0-\u30ffー・]+$/u;
const DHARMA_SUFFIX_RE =
  /(?:上人|禅師|禪師|法師|大師|和尚|阿闍梨|僧都|僧正|律師|尼|上座)$/u;

/**
 * High-frequency modern Japanese surnames (and a few historical clan names).
 * Used only to block *bare* surname search strings — not to reject full names
 * that begin with these characters.
 */
export const COMMON_JAPANESE_SURNAMES = new Set(
  `
佐藤 鈴木 高橋 田中 伊藤 渡辺 渡邊 山本 中村 小林 加藤 吉田 山田 佐々木 山口 松本 井上 木村
林 斎藤 齋藤 清水 山崎 森 池田 橋本 阿部 安部 石川 山下 中島 中嶋 石井 小川 前田 岡田
長谷川 藤田 後藤 近藤 村上 遠藤 青木 坂本 斉藤 福田 太田 大田 西村 藤原 中川 岡本 三浦
竹内 原田 中野 小野 田村 和田 中山 石田 上田 原 森田 柴田 酒井 工藤 横山 宮崎 宮本 内田
高木 安藤 谷口 大野 丸山 今井 河野 藤井 村田 武田 上野 杉山 増田 小山 大塚 平野 菅原
久保 松田 岩崎 木下 野口 松井 千葉 田辺 田邊 菊地 菊池 佐野 新井 荒井 古川 野村 市川
水野 高田 松尾 杉本 島田 古賀 大西 桜井 櫻井 高野 吉川 黒田 黑田 尾崎 永井 松岡 安田
須藤 上原 望月 小島 川口 大橋 松浦 吉村 片山 飯田 中西 福島 辻 関 關 関根 成田 大谷
北村 西田 五十嵐 川崎 浜田 濱田 浜口 服部 東 西 南 北 本田 宮田 大島 荒木 小松 奥村
内藤 白石 大森 岡崎 金井 石原 金子 篠原 久保田 星野 浅野 大久保 藤原 平 源 橘 菅
土屋 松下 永田 三宅 宮下 石橋 大竹 堀 熊谷 片岡 安達 秋山 横田 稲葉 谷 豊田 神田
`.trim().split(/\s+/),
);

/** Heading qualifiers that are not given names. */
const NON_GIVEN_HEADING_RE =
  /^(?:pub\.?\s*)?(?:\d{1,4}|-?\d{1,4}|20\?\?|江戸時代[前後中]期?|安政頃|明治|大正|昭和|平成|令和|[0-9０-９\-\/年頃]+)$/u;

const OCCUPATION_HEADING_RE =
  /(?:漫画家|写真家|小説家|詩人|画家|歌手|俳優|声優|ヨガ|デザイナー|イラストレーター|作家|医師|教授|俳人|歌人|歩兵|中佐|大佐|少将|Web|pub\.?)/u;

/**
 * @param {string} part
 */
export function isNdlGivenNamePart(part) {
  const p = normalizeSurface(part);
  if (!p) return false;
  if (NON_GIVEN_HEADING_RE.test(p)) return false;
  if (OCCUPATION_HEADING_RE.test(p)) return false;
  if (LATIN_RE.test(p) && !KANJI_RE.test(p)) return false;
  // Years / date ranges already excluded; require some Japanese script.
  if (!KANJI_RE.test(p) && !/[\u3040-\u30ff]/u.test(p)) return false;
  return true;
}

/**
 * Parse NDL-style headings: "姓, 名, 年…" or mononym "日蓮, 1222-1282".
 * @param {string | undefined} heading
 * @returns {{ family: string, given: string, parts: string[] }}
 */
export function parseNdlPersonHeading(heading) {
  const parts = normalizeSurface(heading ?? '')
    .split(',')
    .map((s) => normalizeSurface(s))
    .filter(Boolean);
  const family = parts[0] ?? '';
  const given = parts.slice(1).find((p) => isNdlGivenNamePart(p)) ?? '';
  return { family, given, parts };
}

/**
 * Script gate shared with NDL v1 (kanji required; no Latin/digits).
 * @param {string | undefined} value
 */
export function hasUsableJapanesePersonScript(value) {
  const name = normalizeSurface(value ?? '');
  if (!name || isMissingNameToken(name)) return false;
  if (LATIN_RE.test(name) || DIGIT_RE.test(name)) return false;
  if (!KANJI_RE.test(name)) return false;
  return true;
}

/**
 * Independent religious / dharma / art mononym (not a bare modern surname).
 * @param {string} surface
 */
export function looksLikeJapaneseDharmaOrArtName(surface) {
  const s = normalizeSurface(surface);
  if (!s || !KANJI_RE.test(s)) return false;
  if (COMMON_JAPANESE_SURNAMES.has(s)) return false;
  if (DHARMA_SUFFIX_RE.test(s)) return true;
  const len = codePointLength(s);
  // Two-character religious/art names (日蓮, 栄西, 一茶, 芭蕉 as mononym, …).
  if (len === 2) return true;
  return false;
}

/**
 * True when `surface` is only a family name (or equivalent stub).
 * @param {string} surface
 * @param {{
 *   heading?: string;
 *   familyName?: string | null;
 *   givenName?: string | null;
 * }} [opts]
 */
export function isBareJapaneseFamilyName(surface, opts = {}) {
  const s = normalizeSurface(surface);
  if (!s) return true;
  if (codePointLength(s) === 1) return true;
  if (COMMON_JAPANESE_SURNAMES.has(s)) return true;

  const familyClaim = normalizeSurface(opts.familyName ?? '');
  if (familyClaim && s === familyClaim) return true;

  if (opts.heading) {
    const { family, given } = parseNdlPersonHeading(opts.heading);
    if (family && s === family && !given) {
      // Mononym dharma/art authorities are OK; surname stubs are not.
      return !looksLikeJapaneseDharmaOrArtName(s);
    }
  }
  return false;
}

/**
 * Accept into a JA person tag pack: full name or dharma/art mononym.
 * @param {string | undefined} value
 * @param {{
 *   heading?: string;
 *   familyName?: string | null;
 *   givenName?: string | null;
 * }} [opts]
 */
export function isAcceptableJapanesePersonName(value, opts = {}) {
  const s = normalizeSurface(value ?? '');
  if (!hasUsableJapanesePersonScript(s)) return false;
  if (isBareJapaneseFamilyName(s, opts)) return false;

  const familyClaim = normalizeSurface(opts.familyName ?? '');
  const givenClaim = normalizeSurface(opts.givenName ?? '');
  if (familyClaim && givenClaim) {
    const compacted = `${familyClaim}${givenClaim}`;
    if (s === compacted || s === `${familyClaim} ${givenClaim}`) return true;
  }

  if (opts.heading) {
    const { family, given } = parseNdlPersonHeading(opts.heading);
    if (family && given) {
      const compacted = `${family}${given}`;
      if (s === compacted || s === `${family} ${given}` || s === family + given) return true;
    }
  }

  // Full-looking names (3+ kanji/kana mix) or independent dharma/art mononyms.
  if (codePointLength(s) >= 3) return true;
  return looksLikeJapaneseDharmaOrArtName(s);
}

/**
 * Drop kana-only readings, whitespace forms, and joke/vandalism aliases
 * from tagger searchStrings (IME may keep them separately).
 * @param {string} surface
 * @returns {string | null} compacted surface, or null to drop
 */
export function sanitizeJapanesePersonSearchSurface(surface) {
  const s = normalizeSurface(surface);
  if (!s) return null;
  if (/\s/u.test(s)) {
    const compacted = s.replace(/\s+/gu, '');
    return sanitizeJapanesePersonSearchSurface(compacted);
  }
  if (KANA_ONLY_RE.test(s)) return null;
  // Repeated-character vandalism / joke aliases (空母そそそそ, ぴぴぴぴ…).
  if (/(.)\1{3,}/u.test(s)) return null;
  if (/ぬゅぬゅ|ぴぴぴ|そそそ/u.test(s)) return null;
  return s;
}
