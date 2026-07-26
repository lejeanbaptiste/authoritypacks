import { norbertOfficeClue } from '../shared/clue.mjs';
import { SOURCE } from './constants.mjs';
import { OFFICE_COL, bitFlag } from './officeColumns.mjs';

/** @typedef {import('../shared/types.mjs').AuthorityCandidate} AuthorityCandidate */

/** Norbert custom rules for place + geo-admin office combos (see taggingFunctions.py). */
export const GEO_ADMIN_PLACE_CAT = {
  太守: '郡',
  刺史: '州',
  令: '縣',
};

/** Values of `office.cat` that denote administrative place level (not office-type suffixes like 曹/署). */
const ADMIN_PLACE_CATS = new Set(['縣', '郡', '州', '國', '道', '路', '府']);

/**
 * @param {string} primaryName
 * @param {boolean} followsPlace
 * @param {string | undefined} cat
 */
export function resolvePlaceCat(primaryName, followsPlace, cat) {
  if (primaryName in GEO_ADMIN_PLACE_CAT) return GEO_ADMIN_PLACE_CAT[primaryName];
  if (cat && ADMIN_PLACE_CATS.has(cat)) return cat;
  if (followsPlace && primaryName === '令') return GEO_ADMIN_PLACE_CAT['令'];
  return undefined;
}

/**
 * @param {string} primaryName
 * @param {boolean} followsPlace
 * @param {string | undefined} placeCat
 */
export function isGeoAdminSuffix(primaryName, followsPlace, placeCat) {
  return followsPlace || primaryName in GEO_ADMIN_PLACE_CAT || !!placeCat;
}

/**
 * @param {any[]} row
 */
export function officeRowToCandidate(row) {
  const full = row[OFFICE_COL.fullString];
  if (full == null || !String(full).trim()) return null;

  const primaryName = String(full).trim();
  const followsPlace = bitFlag(row[OFFICE_COL.followsPlace]);
  const isNobleTitle = bitFlag(row[OFFICE_COL.isNobleTitle]);
  const cat = row[OFFICE_COL.cat] ? String(row[OFFICE_COL.cat]).trim() : undefined;
  const placeCat = resolvePlaceCat(primaryName, followsPlace, cat);
  const geoAdminSuffix = isGeoAdminSuffix(primaryName, followsPlace, placeCat);

  /** @type {AuthorityCandidate['metadata']} */
  const metadata = {
    teiTag: 'roleName',
    startYear: row[OFFICE_COL.startYear] ?? undefined,
    endYear: row[OFFICE_COL.endYear] ?? undefined,
    description: norbertOfficeClue({
      name: primaryName,
      placeCat,
      startYear: row[OFFICE_COL.startYear] ?? undefined,
      endYear: row[OFFICE_COL.endYear] ?? undefined,
    }),
  };

  if (geoAdminSuffix) metadata.geoAdminSuffix = true;
  if (placeCat) metadata.placeCat = placeCat;
  if (followsPlace) metadata.followsPlace = true;
  if (isNobleTitle) metadata.isNobleTitle = true;
  if (bitFlag(row[OFFICE_COL.followsOffice])) metadata.followsOffice = true;
  if (bitFlag(row[OFFICE_COL.followsPerson])) metadata.followsPerson = true;
  if (bitFlag(row[OFFICE_COL.isSite])) metadata.isSite = true;

  const parentString = row[OFFICE_COL.parentString];
  if (parentString) metadata.parentString = String(parentString).trim();

  const note = row[OFFICE_COL.note];
  if (note && String(note).trim()) {
    metadata.description = `${metadata.description} — ${String(note).trim().slice(0, 80)}`;
  }

  return {
    source: SOURCE,
    authorityId: String(row[OFFICE_COL.id]),
    kind: 'office',
    primaryName,
    searchStrings: [primaryName],
    metadata,
  };
}

/**
 * @param {any[][]} officeRows
 * @returns {AuthorityCandidate[]}
 */
export function compileNorbertOffices(officeRows) {
  /** @type {AuthorityCandidate[]} */
  const out = [];
  for (const row of officeRows) {
    const candidate = officeRowToCandidate(row);
    if (candidate) out.push(candidate);
  }
  return out;
}

/**
 * Compact list for the Norbert concatenate pass (single-char geo-admin suffixes).
 * @param {AuthorityCandidate[]} offices
 */
export function compileGeoAdminSuffixes(offices) {
  return offices
    .filter((c) => c.metadata?.geoAdminSuffix)
    .map((c) => ({
      string: c.primaryName,
      placeCat: c.metadata?.placeCat,
      norbertId: c.authorityId,
    }))
    .sort((a, b) => a.string.localeCompare(b.string, 'zh-Hans'));
}
