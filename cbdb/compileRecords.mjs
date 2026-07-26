import { addSearchString, splitAltNamesField } from '../shared/normalize.mjs';
import { cbdbPersonClue, cbdbPlaceClue, cbdbOfficeClue } from '../shared/clue.mjs';
import { loadCbdbDynastyMap, resolveDynastyByCode } from '../shared/dynastyMap.mjs';
import { personNameEntriesFromAlts } from './personAltNames.mjs';
import { SOURCE } from './constants.mjs';
import { nationalityFromDynasties } from '../shared/nationality.mjs';
import { nationalityAssertion } from '../shared/nationalityConcordance.mjs';
import { officeEntityId } from '../shared/officeGraph.mjs';

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
    const nameEntries = personNameEntriesFromAlts({
      c_name_chn: row.c_name_chn,
      c_surname_chn: row.c_surname_chn,
      c_mingzi_chn: row.c_mingzi_chn,
      alts: altsByPerson.get(row.c_personid) ?? [],
    });
    if (!nameEntries.length) continue;

    const dynasty = resolveDynastyByCode(row.c_dy, dynastyMap);
    const startYear =
      row.c_birthyear ?? row.c_fl_earliest_year ?? row.c_start ?? dynasty?.startYear;
    const endYear = row.c_deathyear ?? row.c_fl_latest_year ?? row.c_end ?? dynasty?.endYear;
    const nationality = nationalityFromDynasties(
      dynasty ? [dynasty] : [],
      { startYear: row.c_birthyear ?? row.c_fl_earliest_year, endYear: row.c_deathyear ?? row.c_fl_latest_year },
    );

    out.push({
      source: SOURCE,
      authorityId: String(row.c_personid),
      kind: 'person',
      primaryName: row.c_name_chn,
      searchStrings: nameEntries.map((entry) => entry.text),
      names: nameEntries,
      metadata: {
        dynasty: row.c_dynasty_chn || dynasty?.label,
        nationality: nationality.map((label) => nationalityAssertion({ source: 'CBDB', id: `dynasty:${row.c_dy}`, label })),
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

const firstValue = (row, names) => {
  for (const name of names) {
    if (row[name] != null && String(row[name]).trim() !== '') return row[name];
  }
  return undefined;
};

function sqliteTableExists(db, name) {
  return Boolean(db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name));
}

/**
 * Export CBDB person-to-office assertions without attempting to reconstruct
 * posting dates or sequence. The current and legacy CBDB schemas use the
 * POSTING_DATA + POSTED_TO_OFFICE_DATA pair; missing tables simply produce an
 * empty pack, which keeps the small fixture database useful for unit tests.
 *
 * @param {Database} db
 * @param {AuthorityCandidate[]} offices
 */
export function compileCbdbAppointments(db, offices) {
  const postingTable = ['POSTING_DATA', 'ZZZ_POSTING_DATA']
    .find((name) => sqliteTableExists(db, name));
  const postedTable = ['POSTED_TO_OFFICE_DATA', 'ZZZ_POSTED_TO_OFFICE_DATA']
    .find((name) => sqliteTableExists(db, name));
  if (!postedTable) return [];

  const postings = new Map();
  if (postingTable) {
    for (const row of db.prepare(`SELECT * FROM "${postingTable}"`).all()) {
      const postingId = firstValue(row, ['c_posting_id', 'c_postingid', 'c_id']);
      if (postingId != null) postings.set(String(postingId), row);
    }
  }
  const officeById = new Map(offices.map((office) => [String(office.authorityId), office]));
  const out = [];
  let fallbackIndex = 0;
  for (const row of db.prepare(`SELECT * FROM "${postedTable}"`).all()) {
    const postingId = firstValue(row, ['c_posting_id', 'c_postingid']);
    const posting = postingId == null ? undefined : postings.get(String(postingId));
    const personId = firstValue(row, ['c_personid', 'c_person_id'])
      ?? firstValue(posting ?? {}, ['c_personid', 'c_person_id']);
    const officeId = firstValue(row, ['c_office_id', 'c_officeid']);
    if (personId == null || (officeId == null && !firstValue(row, ['c_office_chn', 'c_office_name']))) continue;

    const office = officeId == null ? undefined : officeById.get(String(officeId));
    const officeName = firstValue(row, ['c_office_chn', 'c_office_name'])
      ?? office?.primaryName;
    if (!officeName) continue;
    const rowId = firstValue(row, [
      'c_posted_to_office_id',
      'c_posting_office_id',
      'c_id',
    ]) ?? `${postingId ?? 'unknown'}:${officeId ?? officeName}:${fallbackIndex++}`;
    const appointmentType = firstValue(row, [
      'c_appt_code_desc',
      'c_appt_type_desc',
      'c_appt_code',
      'c_appt_type_code',
    ]);
    const sourceRef = firstValue(row, ['c_source', 'c_pages', 'c_notes'])
      ?? firstValue(posting ?? {}, ['c_source', 'c_pages', 'c_notes']);

    out.push({
      source: SOURCE,
      authorityId: String(rowId),
      person: { source: SOURCE, authorityId: String(personId) },
      office: {
        source: SOURCE,
        ...(officeId != null ? { authorityId: String(officeId) } : {}),
        name: String(officeName),
      },
      ...(appointmentType != null ? { appointmentType: String(appointmentType) } : {}),
      ...(sourceRef != null ? { sourceRef: String(sourceRef) } : {}),
    });
  }
  return out;
}

/**
 * @param {Database} db
 * @param {ReturnType<typeof loadCbdbDynastyMap>} dynastyMap
 */
export function compileCbdbOffices(db, dynastyMap) {
  const officeTypeIds = new Map();
  for (const row of db
    .prepare(
      `SELECT c_office_id, c_office_tree_id
       FROM OFFICE_CODE_TYPE_REL
       ORDER BY c_office_id, c_office_tree_id`,
    )
    .all()) {
    const id = String(row.c_office_id);
    const ids = officeTypeIds.get(id) ?? [];
    ids.push(String(row.c_office_tree_id));
    officeTypeIds.set(id, ids);
  }

  const rows = db
    .prepare(
      `SELECT o.c_office_id, o.c_office_chn, o.c_office_chn_alt,
              o.c_office_pinyin, o.c_office_pinyin_alt,
              o.c_office_trans, o.c_office_trans_alt, o.c_source, o.c_pages, o.c_notes, o.c_dy,
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
        entityId: officeEntityId(SOURCE, row.c_office_id),
        canonicalEntityId: officeEntityId(SOURCE, row.c_office_id),
        officeTypeIds: officeTypeIds
          .get(String(row.c_office_id))
          ?.map((id) => `cbdb:office-type:${id}`),
        pinyin: row.c_office_pinyin || undefined,
        alternatePinyin: row.c_office_pinyin_alt || undefined,
        translation: row.c_office_trans || undefined,
        alternateTranslation: row.c_office_trans_alt || undefined,
        sourceRef: row.c_source != null ? String(row.c_source) : undefined,
        sourcePages: row.c_pages || undefined,
        note: row.c_notes || undefined,
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
 * Export CBDB's office classification tree and office-to-category membership.
 * Classification nodes are not taggable office entities.
 *
 * @param {Database} db
 */
export function compileCbdbOfficeGraph(db) {
  const types = db
    .prepare(
      `SELECT c_office_type_node_id, c_office_type_desc, c_office_type_desc_chn, c_parent_id
       FROM OFFICE_TYPE_TREE
       ORDER BY c_office_type_node_id`,
    )
    .all()
    .map((row) => ({
      id: `cbdb:office-type:${row.c_office_type_node_id}`,
      source: SOURCE,
      authorityId: String(row.c_office_type_node_id),
      label:
        row.c_office_type_desc_chn
        || row.c_office_type_desc
        || String(row.c_office_type_node_id),
      translation: row.c_office_type_desc || undefined,
      parentId:
        row.c_parent_id != null && String(row.c_parent_id) !== String(row.c_office_type_node_id)
          ? `cbdb:office-type:${row.c_parent_id}`
          : undefined,
    }));

  const hierarchy = types
    .filter((node) => node.parentId)
    .map((node) => ({
      id: `cbdb:office-type-parent:${node.parentId.slice('cbdb:office-type:'.length)}:${node.authorityId}`,
      type: 'parentOf',
      subject: node.parentId,
      object: node.id,
      source: SOURCE,
      confidence: 'asserted',
      evidence: {
        rule: 'office-type-tree-parent',
        table: 'OFFICE_TYPE_TREE',
        sourceIds: [node.parentId.slice('cbdb:office-type:'.length), node.authorityId],
      },
    }));

  const memberships = db
    .prepare(
      `SELECT c_office_id, c_office_tree_id
       FROM OFFICE_CODE_TYPE_REL
       ORDER BY c_office_id, c_office_tree_id`,
    )
    .all()
    .map((row) => ({
      id: `cbdb:office-membership:${row.c_office_id}:${row.c_office_tree_id}`,
      type: 'belongsTo',
      subject: officeEntityId(SOURCE, row.c_office_id),
      object: `cbdb:office-type:${row.c_office_tree_id}`,
      source: SOURCE,
      confidence: 'asserted',
      evidence: {
        rule: 'office-type-membership',
        table: 'OFFICE_CODE_TYPE_REL',
        sourceIds: [String(row.c_office_id), String(row.c_office_tree_id)],
      },
    }));

  return { types, relations: [...hierarchy, ...memberships] };
}

/**
 * @param {Database} db
 */
export function compileCbdb(db) {
  const dynastyMap = loadCbdbDynastyMap(db);
  const officeGraph = compileCbdbOfficeGraph(db);
  const offices = compileCbdbOffices(db, dynastyMap);
  return {
    persons: compileCbdbPersons(db, dynastyMap),
    places: compileCbdbPlaces(db, dynastyMap),
    offices,
    appointments: compileCbdbAppointments(db, offices),
    officeTypes: officeGraph.types,
    officeRelations: officeGraph.relations,
  };
}
