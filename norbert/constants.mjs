/** Norbert `codes_person_name_type.id` values excluded from search strings. */
export const NAME_TYPE_EXCLUDE = new Set([
  5, // Childhood name 小名
  6, // Childhood courtesy name 小字
]);

export const SOURCE = 'Norbert';

/**
 * Norbert `person_names.name_type_id` → LJB canonical name-type id
 * (`leaf-writer/packages/cwrc-leafwriter/src/autoTagging/nameTypes.ts`).
 *
 * Norbert numbering differs from CBDB; see README mapping table.
 */
export const NORBERT_NAME_TYPE_MAP = new Map([
  [0, 'family'], // 姓
  [1, 'given'], // 名
  [2, 'courtesy'], // 字
  [3, 'variant'], // 賜號
  [4, 'art'], // 室名
  [7, 'variant'], // 本姓
  [8, 'birth'], // 本名
  [9, 'posthumous'], // 諡號
  [10, 'dharma'], // 法號
  [11, 'variant'], // 俗姓 (paired with 12)
  [12, 'variant'], // 俗名 (paired with 11)
  [13, 'dharma'], // 道號
  [14, 'variant'], // 尊號
  [15, 'variant'], // uncategorised
  [16, 'variant'], // 賜姓
  [17, 'temple'], // 廟號
]);
