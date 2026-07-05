import { addSearchString, splitAltNamesField } from '../shared/normalize.mjs';
import { cbdbPersonClue, cbdbPlaceClue, cbdbOfficeClue } from '../shared/clue.mjs';
import { loadCbdbDynastyMap, resolveDynastyByCode } from '../shared/dynastyMap.mjs';
import { personSearchStringsFromAlts } from './personAltNames.mjs';
import { SOURCE } from './constants.mjs';

/** @typedef {import('../shared/types.mjs').AuthorityCandidate} AuthorityCandidate */
/** @typedef {import('better-sqlite3').Database} Database */

/**
 * @param {Database} db
 * @param {ReturnType<typeof loadCbdbDynastyMap>} dynastyMap
 */
export function compileCbdbPersons(db, dynastyMap) {
  const mainRows = db
    .prepare(
      `SELECT m.c_personid, m.c_name_chn, m.c_name, m.c_surname_chn, m.c_mingzi_chn,
              m.c_birthyear, m.c_deathyear, m.c_index_year, m.c_fl_earliest_year, m.c_fl_latest_year,
              m.c_dy, d.c_dynasty_chn, d.c_dynasty, d.c_start, d.c_end
       FROM BIOG_MAIN m
       LEFT JOIN DYNASTIES d ON m.c_dy = d.c_dy
       WHERE m.c_name_chn IS NOT NULL AND TRIM(m.c_name_chn) != ''`,
    )
    .all();

  const altRows = db
    .prepare(
      `SELECT c_personid, c_alt_name_chn, c_alt_name_type_code
       FROM ALTNAME_DATA
       WHERE c_alt_name_chn IS NOT NULL AND TRIM(c_alt_name_chn) != ''`,
    )
    .all();

  /** @type {Map<number, { type: number; value: string }[]>} */
  const altsByPerson = new Map();
  for (const row of altRows) {
    let list = altsByPerson.get(row.c_personid);
    if (!list) {
      list = [];
      altsByPerson.set(row.c_personid, list);
    }
    list.push({ type: row.c_alt_name_type_code, value: row.c_alt_name_chn });
  }

  /** @type {AuthorityCandidate[]} */
  const out = [];
  for (const row of mainRows) {
    const searchStrings = personSearchStringsFromAlts({
      c_name_chn: row.c_name_chn,
      c_surname_chn: row.c_surname_chn,
      c_mingzi_chn: row.c_mingzi_chn,
      alts: altsByPerson.get(row.c_personid) ?? [],
    });
    if (!searchStrings.length) continue;

    const dynasty = resolveDynastyByCode(row.c_dy, dynastyMap);
    const startYear =
      row.c_birthyear ?? row.c_fl_earliest_year ?? row.c_start ?? dynasty?.startYear;
    const endYear = row.c_deathyear ?? row.c_fl_latest_year ?? row.c_end ?? dynasty?.endYear;

    out.push({
      source: SOURCE,
      authorityId: String(row.c_personid),
      kind: 'person',
      primaryName: row.c_name_chn,
      searchStrings,
      metadata: {
        dynasty: row.c_dynasty_chn || dynasty?.label,
        startYear: startYear ?? undefined,
        endYear: endYear ?? undefined,
        pinyin: row.c_name || undefined,
        description: cbdbPersonClue({
          name: row.c_name_chn,
          pinyin: row.c_name || undefined,
          birthYear: row.c_birthyear ?? undefined,
          deathYear: row.c_deathyear ?? undefined,
          indexYear: row.c_index_year ?? undefined,
          flStart: row.c_fl_earliest_year ?? undefined,
          flEnd: row.c_fl_latest_year ?? undefined,
          dynastyChn: row.c_dynasty_chn || dynasty?.label,
          dynastyEn: row.c_dynasty || dynasty?.dynastyEn,
        }),
      },
    });
  }
  return out;
}

/**
 * @param {Database} db
 * @param {ReturnType<typeof loadCbdbDynastyMap>} dynastyMap
 */
export function compileCbdbPlaces(db, _dynastyMap) {
  const rows = db
    .prepare(
      `SELECT a.c_addr_id, a.c_name_chn, a.c_alt_names, a.c_firstyear, a.c_lastyear,
              a.c_admin_type
       FROM ADDR_CODES a
       WHERE a.c_name_chn IS NOT NULL AND TRIM(a.c_name_chn) != ''`,
    )
    .all();

  /** @type {AuthorityCandidate[]} */
  const out = [];
  for (const row of rows) {
    /** @type {Set<string>} */
    const searchStrings = new Set();
    addSearchString(searchStrings, row.c_name_chn);
    for (const alt of splitAltNamesField(row.c_alt_names)) addSearchString(searchStrings, alt);
    if (!searchStrings.size) continue;

    out.push({
      source: SOURCE,
      authorityId: String(row.c_addr_id),
      kind: 'place',
      primaryName: row.c_name_chn,
      searchStrings: [...searchStrings],
      metadata: {
        subtype: row.c_admin_type || undefined,
        startYear: row.c_firstyear ?? undefined,
        endYear: row.c_lastyear ?? undefined,
        description: cbdbPlaceClue({
          name: row.c_name_chn,
          subtype: row.c_admin_type || undefined,
          startYear: row.c_firstyear ?? undefined,
          endYear: row.c_lastyear ?? undefined,
        }),
      },
    });
  }
  return out;
}

/**
 * @param {Database} db
 * @param {ReturnType<typeof loadCbdbDynastyMap>} dynastyMap
 */
export function compileCbdbOffices(db, dynastyMap) {
  const rows = db
    .prepare(
      `SELECT o.c_office_id, o.c_office_chn, o.c_office_chn_alt, o.c_office_trans, o.c_dy,
              d.c_dynasty_chn, d.c_dynasty
       FROM OFFICE_CODES o
       LEFT JOIN DYNASTIES d ON o.c_dy = d.c_dy
       WHERE o.c_office_chn IS NOT NULL AND TRIM(o.c_office_chn) != ''`,
    )
    .all();

  /** @type {AuthorityCandidate[]} */
  const out = [];
  for (const row of rows) {
    /** @type {Set<string>} */
    const searchStrings = new Set();
    addSearchString(searchStrings, row.c_office_chn);
    if (row.c_office_chn_alt) addSearchString(searchStrings, row.c_office_chn_alt);
    if (!searchStrings.size) continue;

    const dynasty = resolveDynastyByCode(row.c_dy, dynastyMap);

    out.push({
      source: SOURCE,
      authorityId: String(row.c_office_id),
      kind: 'office',
      primaryName: row.c_office_chn,
      searchStrings: [...searchStrings],
      metadata: {
        teiTag: 'roleName',
        dynasty: row.c_dynasty_chn || dynasty?.label,
        startYear: dynasty?.startYear,
        endYear: dynasty?.endYear,
        translation: row.c_office_trans || undefined,
        description: cbdbOfficeClue({
          name: row.c_office_chn,
          translation: row.c_office_trans || undefined,
          dynastyChn: row.c_dynasty_chn || dynasty?.label,
        }),
      },
    });
  }
  return out;
}

/**
 * @param {Database} db
 */
export function compileCbdb(db) {
  const dynastyMap = loadCbdbDynastyMap(db);
  return {
    persons: compileCbdbPersons(db, dynastyMap),
    places: compileCbdbPlaces(db, dynastyMap),
    offices: compileCbdbOffices(db, dynastyMap),
  };
}
