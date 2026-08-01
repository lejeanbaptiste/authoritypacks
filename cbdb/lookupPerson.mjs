/**
 * Per-person CBDB reference lookup (A6). Targeted queries only — no full-table scan.
 * @typedef {import('better-sqlite3').Database} Database
 */
import { buildPersonNamesFromAlts } from './personAltNames.mjs';
import { loadCbdbDynastyMap, resolveDynastyByCode } from '../shared/dynastyMap.mjs';
import { nationalityFromDynasties } from '../shared/nationality.mjs';
import { nationalityAssertion } from '../shared/nationalityConcordance.mjs';
import { SOURCE } from './constants.mjs';
import { cbdbPersonClue } from '../shared/clue.mjs';

function tableExists(db, name) {
  return Boolean(db.prepare(
    `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`,
  ).get(name));
}

function cbdbOriginType(type) {
  return ({ 1: 'jiguan', 5: 'ancestralOrigin', 7: 'benguan', 8: 'birthplace' })[type] ?? 'placeOfOrigin';
}

/**
 * @param {Database} db
 * @param {string|number} personId
 * @returns {import('../shared/types.mjs').AuthorityCandidate | null}
 */
export function lookupCbdbPerson(db, personId) {
  const id = Number(String(personId).replace(/^0+(?=\d)/, ''));
  if (!Number.isFinite(id)) return null;

  const row = db.prepare(`
    SELECT m.c_personid, m.c_name_chn, m.c_name, m.c_surname_chn, m.c_mingzi_chn,
           m.c_birthyear, m.c_deathyear, m.c_index_year, m.c_fl_earliest_year, m.c_fl_latest_year,
           m.c_dy, d.c_dynasty_chn, d.c_dynasty, d.c_start, d.c_end
    FROM BIOG_MAIN m
    LEFT JOIN DYNASTIES d ON m.c_dy = d.c_dy
    WHERE m.c_personid = ?
  `).get(id);
  if (!row?.c_name_chn) return null;

  const alts = tableExists(db, 'ALTNAME_DATA')
    ? db.prepare(`
        SELECT c_alt_name_chn, c_alt_name_type_code
        FROM ALTNAME_DATA
        WHERE c_personid = ? AND c_alt_name_chn IS NOT NULL AND TRIM(c_alt_name_chn) != ''
      `).all(id).map((a) => ({ type: a.c_alt_name_type_code, value: a.c_alt_name_chn }))
    : [];

  const { names, searchStrings } = buildPersonNamesFromAlts({
    c_name_chn: row.c_name_chn,
    c_surname_chn: row.c_surname_chn,
    c_mingzi_chn: row.c_mingzi_chn,
    alts,
  });

  const dynastyMap = loadCbdbDynastyMap();
  const dynasty = resolveDynastyByCode(row.c_dy, dynastyMap);
  const startYear = row.c_birthyear ?? row.c_fl_earliest_year ?? row.c_start ?? dynasty?.startYear;
  const endYear = row.c_deathyear ?? row.c_fl_latest_year ?? row.c_end ?? dynasty?.endYear;
  const nationality = nationalityFromDynasties(
    dynasty ? [dynasty] : [],
    { startYear: row.c_birthyear ?? row.c_fl_earliest_year, endYear: row.c_deathyear ?? row.c_fl_latest_year },
  ).map((label) => nationalityAssertion({ source: 'CBDB', id: `dynasty:${row.c_dy}`, label }));

  const origin = lookupCbdbOrigins(db, id);
  const appointments = lookupCbdbAppointments(db, id);

  return {
    source: SOURCE,
    authorityId: String(row.c_personid),
    kind: 'person',
    primaryName: row.c_name_chn,
    searchStrings,
    names,
    metadata: {
      dynasty: row.c_dynasty_chn || dynasty?.label,
      nationality,
      origin: origin.length ? origin : undefined,
      appointments: appointments.length ? appointments : undefined,
      dateSource: row.c_birthyear != null || row.c_deathyear != null || row.c_fl_earliest_year != null || row.c_fl_latest_year != null ? 'fine' : 'nationality',
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
      }),
    },
  };
}

/** @param {Database} db @param {number} personId */
function lookupCbdbOrigins(db, personId) {
  if (!tableExists(db, 'BIOG_ADDR_DATA') || !tableExists(db, 'ADDR_CODES')) return [];
  const hasTypeCodes = tableExists(db, 'BIOG_ADDR_CODES');
  const typeJoin = hasTypeCodes ? 'LEFT JOIN BIOG_ADDR_CODES t ON t.c_addr_type = b.c_addr_type' : '';
  const typeLabel = hasTypeCodes ? 't.c_addr_desc_chn' : 'NULL';
  const rows = db.prepare(`
    SELECT b.c_addr_id, b.c_addr_type, ${typeLabel} AS c_addr_type_desc,
           b.c_source, b.c_pages, b.c_notes, b.c_natal,
           a.c_name_chn, a.c_admin_type AS c_place_type
    FROM BIOG_ADDR_DATA b
    LEFT JOIN ADDR_CODES a ON a.c_addr_id = b.c_addr_id
    ${typeJoin}
    WHERE b.c_personid = ?
      AND b.c_addr_type IN (1, 5, 7, 8)
      AND (b.c_delete IS NULL OR b.c_delete = 0)
    ORDER BY b.c_sequence
  `).all(personId);
  return rows.flatMap((row) => {
    const placeName = row.c_name_chn ? String(row.c_name_chn).trim() : '';
    if (!placeName && row.c_addr_id == null) return [];
    return [{
      source: SOURCE,
      originType: cbdbOriginType(row.c_addr_type),
      placeName: placeName || String(row.c_addr_id),
      placeAuthorityId: row.c_addr_id == null ? undefined : String(row.c_addr_id),
      sourceCategory: row.c_addr_type_desc || String(row.c_addr_type),
      placeType: row.c_place_type || undefined,
      sourceRef: [row.c_source, row.c_pages].filter(Boolean).join(' ') || undefined,
      note: row.c_notes || undefined,
      qualification: row.c_natal ? 'natal' : undefined,
    }];
  });
}

/** @param {Database} db @param {number} personId */
function lookupCbdbAppointments(db, personId) {
  const postingTable = ['POSTING_DATA', 'ZZZ_POSTING_DATA'].find((n) => tableExists(db, n));
  const postedTable = ['POSTED_TO_OFFICE_DATA', 'ZZZ_POSTED_TO_OFFICE_DATA'].find((n) => tableExists(db, n));
  if (!postedTable || !postingTable) return [];

  const rows = db.prepare(`
    SELECT p.c_posting_id, o.c_office_id, oc.c_office_chn, o.c_source AS office_source
    FROM "${postingTable}" p
    JOIN "${postedTable}" o ON o.c_posting_id = p.c_posting_id
    LEFT JOIN OFFICE_CODES oc ON oc.c_office_id = o.c_office_id
    WHERE p.c_personid = ?
  `).all(personId);

  return rows.flatMap((row, index) => {
    const officeName = row.c_office_chn == null ? '' : String(row.c_office_chn).trim();
    if (!officeName) return [];
    return [{
      source: SOURCE,
      authorityId: String(row.c_posting_id ?? `posting:${personId}:${index}`),
      person: { source: SOURCE, authorityId: String(personId) },
      office: {
        source: SOURCE,
        ...(row.c_office_id != null ? { authorityId: String(row.c_office_id) } : {}),
        name: officeName,
      },
      ...(row.office_source ? { sourceRef: String(row.office_source) } : {}),
    }];
  });
}
