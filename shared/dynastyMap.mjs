/**
 * Map free-text dynasty labels (DILA notes, CBDB 漢字) → year range.
 * CBDB DYNASTIES table is loaded at compile time; static aliases cover splits.
 */

/** @typedef {{ label: string, startYear: number, endYear: number, dynastyEn?: string }} DynastyRange */

/** @type {Record<string, Omit<DynastyRange, 'label'>>} */
export const STATIC_DYNASTY_ALIASES = {
  秦: { startYear: -221, endYear: -206, dynastyEn: 'Qin' },
  西漢: { startYear: -206, endYear: 9, dynastyEn: 'Western Han' },
  西汉: { startYear: -206, endYear: 9, dynastyEn: 'Western Han' },
  前漢: { startYear: -206, endYear: 9, dynastyEn: 'Western Han' },
  東漢: { startYear: 25, endYear: 220, dynastyEn: 'Eastern Han' },
  东汉: { startYear: 25, endYear: 220, dynastyEn: 'Eastern Han' },
  漢: { startYear: -206, endYear: 220, dynastyEn: 'Han' },
  汉: { startYear: -206, endYear: 220, dynastyEn: 'Han' },
  魏: { startYear: 220, endYear: 266, dynastyEn: 'Wei' },
  曹魏: { startYear: 220, endYear: 266, dynastyEn: 'Cao Wei' },
  蜀: { startYear: 221, endYear: 263, dynastyEn: 'Shu Han' },
  蜀汉: { startYear: 221, endYear: 263, dynastyEn: 'Shu Han' },
  蜀漢: { startYear: 221, endYear: 263, dynastyEn: 'Shu Han' },
  吳: { startYear: 222, endYear: 280, dynastyEn: 'Eastern Wu' },
  吴: { startYear: 222, endYear: 280, dynastyEn: 'Eastern Wu' },
  東吳: { startYear: 222, endYear: 280, dynastyEn: 'Eastern Wu' },
  东吴: { startYear: 222, endYear: 280, dynastyEn: 'Eastern Wu' },
  西晉: { startYear: 266, endYear: 316, dynastyEn: 'Western Jin' },
  西晋: { startYear: 266, endYear: 316, dynastyEn: 'Western Jin' },
  東晉: { startYear: 317, endYear: 420, dynastyEn: 'Eastern Jin' },
  东晋: { startYear: 317, endYear: 420, dynastyEn: 'Eastern Jin' },
  北魏: { startYear: 386, endYear: 534, dynastyEn: 'Northern Wei' },
  隋: { startYear: 581, endYear: 618, dynastyEn: 'Sui' },
  唐: { startYear: 618, endYear: 907, dynastyEn: 'Tang' },
  五代: { startYear: 907, endYear: 960, dynastyEn: 'Five Dynasties' },
  北宋: { startYear: 960, endYear: 1127, dynastyEn: 'Northern Song' },
  南宋: { startYear: 1127, endYear: 1279, dynastyEn: 'Southern Song' },
  宋: { startYear: 960, endYear: 1279, dynastyEn: 'Song' },
  刘宋: { startYear: 420, endYear: 479, dynastyEn: 'Liu Song' },
  劉宋: { startYear: 420, endYear: 479, dynastyEn: 'Liu Song' },
  南齐: { startYear: 479, endYear: 502, dynastyEn: 'Southern Qi' },
  南齊: { startYear: 479, endYear: 502, dynastyEn: 'Southern Qi' },
  梁: { startYear: 502, endYear: 557, dynastyEn: 'Liang' },
  陈: { startYear: 557, endYear: 589, dynastyEn: 'Chen' },
  陳: { startYear: 557, endYear: 589, dynastyEn: 'Chen' },
  元: { startYear: 1271, endYear: 1368, dynastyEn: 'Yuan' },
  明: { startYear: 1368, endYear: 1644, dynastyEn: 'Ming' },
  清: { startYear: 1636, endYear: 1912, dynastyEn: 'Qing' },
  民国: { startYear: 1912, endYear: 1949, dynastyEn: 'ROC' },
  民國: { startYear: 1912, endYear: 1949, dynastyEn: 'ROC' },
  中华人民共和国: { startYear: 1949, endYear: 2100, dynastyEn: 'PRC' },
};

/**
 * @param {import('better-sqlite3').Database | null} db
 */
export function loadCbdbDynastyMap(db) {
  /** @type {Map<string, DynastyRange>} */
  const byChn = new Map();
  /** @type {Map<number, DynastyRange>} */
  const byCode = new Map();

  for (const [label, range] of Object.entries(STATIC_DYNASTY_ALIASES)) {
    byChn.set(label, { label, ...range });
  }

  if (db) {
    const rows = db.prepare('SELECT c_dy, c_dynasty, c_dynasty_chn, c_start, c_end FROM DYNASTIES').all();
    for (const row of rows) {
      const entry = {
        label: row.c_dynasty_chn || row.c_dynasty || String(row.c_dy),
        startYear: row.c_start,
        endYear: row.c_end,
        dynastyEn: row.c_dynasty || undefined,
      };
      byCode.set(row.c_dy, entry);
      if (row.c_dynasty_chn) byChn.set(normalizeDynastyLabel(row.c_dynasty_chn), entry);
      if (row.c_dynasty) byChn.set(normalizeDynastyLabel(row.c_dynasty), entry);
    }
  }

  return { byChn, byCode };
}

/** @param {string} raw */
export function normalizeDynastyLabel(raw) {
  return raw.replace(/\s+/g, '').trim();
}

/**
 * @param {string | undefined | null} label
 * @param {{ byChn: Map<string, DynastyRange> }} map
 */
export function resolveDynastyByLabel(label, map) {
  if (!label) return undefined;
  const key = normalizeDynastyLabel(label);
  return map.byChn.get(key);
}

/**
 * @param {number | null | undefined} code
 * @param {{ byCode: Map<number, DynastyRange> }} map
 */
export function resolveDynastyByCode(code, map) {
  if (code == null) return undefined;
  return map.byCode.get(code);
}
