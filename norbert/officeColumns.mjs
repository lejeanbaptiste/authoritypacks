/** Column indices for Norbert `office` table rows (humanum mysqldump order). */
export const OFFICE_COL = {
  id: 0,
  fullString: 1,
  parentString: 2,
  parentIsSite: 3,
  prefix: 4,
  core: 5,
  cat: 6,
  catIsSuffix: 7,
  yieldPrefix: 8,
  followsPlace: 9,
  followsOffice: 10,
  followsPerson: 11,
  isCollective: 12,
  isSite: 13,
  isReligious: 14,
  isMilitary: 15,
  isNobleTitle: 16,
  isMeritTitle: 17,
  isPrestigeTitle: 18,
  isQualifier: 19,
  startYear: 20,
  endYear: 21,
  note: 22,
};

/** @param {unknown} value mysqldump bit(1) → 0/1/null */
export function bitFlag(value) {
  return value === 1;
}
