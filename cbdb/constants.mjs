/** Altname type codes always excluded (see cbdb/README.md). */
export const ALTNAME_EXCLUDE = new Set([0, 7, 9, 10]);

export const SOURCE = 'CBDB';

/**
 * CBDB `ALTNAME_CODES.c_name_type_code` → canonical LJB name-type id
 * (`leaf-writer/packages/cwrc-leafwriter/src/autoTagging/nameTypes.ts`).
 * Only codes that already pass into `searchStrings` (see README altname table)
 * are mapped; codes silently dropped upstream (0, 7, 9, 10, 16, 17, 21) have
 * no entry here and are never emitted as typed names either.
 *
 * 20 (Daoist name 道號) folds into `dharma` — LJB's vocabulary treats it as
 * the generic "religious ordination name" bucket alongside the Buddhist
 * dharma name (19); a courtesy/art-name split isn't the right frame for a
 * name taken on ordination.
 *
 * 8 (封爵), 11 (賜號), 15 (尊號), and the secular/original-name codes
 * (12+13, 18) are titles/birth-names rather than the courtesy/art/posthumous/
 * temple categories LJB curates for — they map to `variant` (searchable,
 * untyped for filtering purposes) rather than inventing narrower LJB types
 * for a single upstream source.
 */
export const CBDB_NAME_TYPE_MAP = new Map([
  [3, 'variant'], // 別名、曾用名 — alternate/previously used name
  [4, 'courtesy'], // 字
  [5, 'art'], // 室名、別號 — studio/style name
  [6, 'posthumous'], // 諡號
  [8, 'variant'], // 封爵 — enfeoffment title
  [11, 'variant'], // 賜號 — bestowed name/title
  [12, 'variant'], // 俗姓 — secular surname (paired with 13)
  [13, 'variant'], // 俗名 — secular given name (paired with 12)
  [14, 'temple'], // 廟號
  [15, 'variant'], // 尊號 — honorific name
  [18, 'variant'], // 本姓 — original surname
  [19, 'dharma'], // 法號
  [20, 'dharma'], // 道號 — Daoist name (see note above)
]);
