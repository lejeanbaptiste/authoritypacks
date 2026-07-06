import { chgisPlaceClue } from '../shared/clue.mjs';
import { addSearchString } from '../shared/normalize.mjs';
import {
  chgisAdminType,
  chgisChineseName,
  chgisSimplifiedName,
  chgisStemName,
  chgisSystemId,
  chgisTraditionalName,
  chgisYear,
  isPointRow,
} from './fieldMap.mjs';

/** @typedef {import('../shared/types.mjs').AuthorityCandidate} AuthorityCandidate */
/** @typedef {import('./fieldMap.mjs').ChgisRow} ChgisRow */

const SOURCE = 'CHGIS';

/**
 * @param {string} name
 * @param {string | undefined} typeCh
 * @returns {string[]}
 */
export function buildChgisSearchStrings(name, typeCh) {
  /** @type {Set<string>} */
  const searchStrings = new Set();
  addSearchString(searchStrings, name);
  const stem = chgisStemName(name, typeCh);
  if (stem) addSearchString(searchStrings, stem);
  return [...searchStrings];
}

/**
 * @param {ChgisRow} row
 * @param {{ cbdbByChgisId?: Map<string, string>, dilaByChgisId?: Map<string, string>, layer?: string }} [ctx]
 * @returns {AuthorityCandidate | null}
 */
export function placeFromChgisRow(row, ctx = {}) {
  if (!isPointRow(row)) return null;

  const name = chgisChineseName(row);
  const systemId = chgisSystemId(row);
  if (!name || !systemId) return null;

  const typeCh = chgisAdminType(row);
  const startYear = chgisYear(row, 'BEG_YR');
  const endYear = chgisYear(row, 'END_YR');
  const pinyin = typeof row.NAME_PY === 'string' ? row.NAME_PY.trim() : undefined;
  const presentLoc = typeof row.PRES_LOC === 'string' ? row.PRES_LOC.trim() : undefined;
  const nameCh = chgisSimplifiedName(row) || undefined;
  const nameFt = chgisTraditionalName(row) || undefined;
  const lat = typeof row.lat === 'number' ? row.lat : undefined;
  const lon = typeof row.lon === 'number' ? row.lon : undefined;

  /** @type {Set<string>} */
  const searchStrings = new Set();
  for (const s of buildChgisSearchStrings(name, typeCh)) searchStrings.add(s);
  if (!searchStrings.size) return null;

  const cbdbId = ctx.cbdbByChgisId?.get(systemId);
  const dilaId = ctx.dilaByChgisId?.get(systemId);
  /** @type {AuthorityCandidate['metadata']['crosswalk']} */
  const crosswalk = { chgis: systemId };
  if (cbdbId) crosswalk.cbdb = cbdbId;
  if (dilaId) crosswalk.dila = dilaId;

  /** @type {AuthorityCandidate} */
  const candidate = {
    source: SOURCE,
    authorityId: systemId,
    kind: 'place',
    primaryName: name,
    searchStrings: [...searchStrings],
    metadata: {
      subtype: typeCh,
      startYear,
      endYear,
      pinyin,
      nameFt,
      nameCh,
      geo: lat != null && lon != null ? { lat, lon } : undefined,
      description: chgisPlaceClue({
        name,
        subtype: typeCh,
        startYear,
        endYear,
        presentLoc,
        pinyin,
      }),
      crosswalk,
      layer: ctx.layer,
    },
  };

  return candidate;
}

/**
 * @param {Iterable<ChgisRow>} rows
 * @param {{ cbdbByChgisId?: Map<string, string>, dilaByChgisId?: Map<string, string>, layer?: string }} [ctx]
 * @returns {AuthorityCandidate[]}
 */
export function compileChgisPlaces(rows, ctx = {}) {
  /** @type {AuthorityCandidate[]} */
  const out = [];
  for (const row of rows) {
    const candidate = placeFromChgisRow(row, ctx);
    if (candidate) out.push(candidate);
  }
  return out;
}
