/**
 * Per-person Norbert reference lookup (A6) against norbert.sqlite3.
 * @typedef {import('better-sqlite3').Database} Database
 */
import { personNameEntriesFromNorbert } from './personNames.mjs';
import { nationalityFromDynasties } from '../shared/nationality.mjs';
import { nationalityAssertion } from '../shared/nationalityConcordance.mjs';
import { norbertPersonClue } from '../shared/clue.mjs';
import { SOURCE } from './constants.mjs';
import { formatNorbertAuthorityValue } from './norbertAuthorityId.mjs';

/**
 * @param {Database} db
 * @param {string|number} personId bare or person-N
 */
export function lookupNorbertPerson(db, personId) {
  const bare = String(personId).replace(/^person[-:]/i, '').trim();
  const id = Number(bare);
  if (!Number.isFinite(id)) return null;

  const row = db.prepare(
    `SELECT id, can_name, description, mythical FROM person WHERE id = ?`,
  ).get(id);
  if (!row?.can_name) return null;

  const nameRows = db.prepare(
    `SELECT name, name_type_id FROM person_names WHERE person_id = ?`,
  ).all(id).map((n) => ({ type: n.name_type_id, value: n.name }));

  const names = personNameEntriesFromNorbert({
    can_name: row.can_name,
    names: nameRows,
  });
  if (!names.length) return null;

  /** @type {Map<number, { evidence?: string }>} */
  const pairs = new Map();
  for (const pd of db.prepare(`SELECT dyn_id FROM person_dynasties WHERE person_id = ?`).all(id)) {
    if (pd.dyn_id != null) pairs.set(Number(pd.dyn_id), {});
  }
  for (const nat of db.prepare(
    `SELECT court_id, string FROM nat_raw WHERE person_id = ? AND court_id IS NOT NULL`,
  ).all(id)) {
    const dynId = Number(nat.court_id);
    const evidence = nat.string == null ? undefined : String(nat.string).trim() || undefined;
    const existing = pairs.get(dynId);
    if (!existing) pairs.set(dynId, { ...(evidence ? { evidence } : {}) });
    else if (evidence && !existing.evidence) existing.evidence = evidence;
  }

  /** @type {Map<number, { zh: string, en?: string, startYear?: number, endYear?: number }>} */
  const labels = new Map();
  for (const lab of db.prepare(`SELECT id, zh, en, start_year, end_year FROM dynasty_labels`).all()) {
    labels.set(Number(lab.id), {
      zh: lab.zh,
      ...(lab.en ? { en: lab.en } : {}),
      ...(lab.start_year != null ? { startYear: lab.start_year } : {}),
      ...(lab.end_year != null ? { endYear: lab.end_year } : {}),
    });
  }

  const nationalityLabels = nationalityFromDynasties(
    [...pairs.keys()].map((dynId) => {
      const d = labels.get(dynId);
      return d ? { label: d.zh, startYear: d.startYear, endYear: d.endYear } : null;
    }).filter(Boolean),
    {},
  );
  const nationality = nationalityLabels.map((label) => {
    const dynId = [...pairs.keys()].find((k) => labels.get(k)?.zh === label);
    const evidence = dynId != null ? pairs.get(dynId)?.evidence : undefined;
    const assertion = nationalityAssertion({
      source: 'Norbert',
      id: dynId != null ? `dynasty:${dynId}` : `dynasty:${label}`,
      label,
    });
    return evidence ? { ...assertion, evidence } : assertion;
  });

  let dynastyLabel;
  let dynastyEn;
  const firstDyn = pairs.keys().next().value;
  if (firstDyn != null && labels.has(firstDyn)) {
    dynastyLabel = labels.get(firstDyn).zh;
    dynastyEn = labels.get(firstDyn).en;
  }

  const origins = db.prepare(
    `SELECT "placeName" AS place_name, cat, qualification, source FROM person_origin WHERE person_id = ?`,
  ).all(id).flatMap((o) => {
    const placeName = o.place_name == null ? '' : String(o.place_name).trim();
    if (!placeName) return [];
    return [{
      source: SOURCE,
      originType: 'jiguan',
      placeName,
      placeType: o.cat == null ? undefined : String(o.cat).trim() || undefined,
      qualification: o.qualification == null ? undefined : String(o.qualification).trim() || undefined,
      sourceRef: o.source == null ? undefined : String(o.source).trim() || undefined,
    }];
  });

  const appointments = db.prepare(`
    SELECT oh.ind, oh.office_string, oh.office_id, oh.source, o.full_string
    FROM officeholding_raw oh
    LEFT JOIN office o ON o.id = oh.office_id
    WHERE oh.recipient_id = ?
  `).all(id).flatMap((a) => {
    const officeName = (a.office_string ?? a.full_string) == null
      ? ''
      : String(a.office_string ?? a.full_string).trim();
    if (!officeName) return [];
    return [{
      source: SOURCE,
      authorityId: String(a.ind),
      person: { source: SOURCE, authorityId: formatNorbertAuthorityValue('person', id) },
      office: {
        source: SOURCE,
        ...(a.office_id != null ? { authorityId: formatNorbertAuthorityValue('office', a.office_id) } : {}),
        name: officeName,
      },
      ...(a.source ? { sourceRef: String(a.source) } : {}),
    }];
  });

  const nobleTitles = db.prepare(`
    SELECT ind, dyn, fief, pn, nt, tn, dyn_id
    FROM person_nt WHERE person_id = ?
  `).all(id).flatMap((t) => {
    const fief = t.fief == null ? '' : String(t.fief).trim();
    const rank = t.nt == null ? '' : String(t.nt).trim();
    const posthumous = t.pn == null ? '' : String(t.pn).trim();
    const temple = t.tn == null ? '' : String(t.tn).trim();
    if (![fief, rank, posthumous, temple].some(Boolean)) return [];
    return [{
      id: String(t.ind),
      dynasty: t.dyn == null ? undefined : String(t.dyn).trim() || undefined,
      fief: fief || undefined,
      rank: rank || undefined,
      posthumous: posthumous || undefined,
      temple: temple || undefined,
    }];
  });

  const sourceDescription = row.description == null
    ? undefined
    : String(row.description).trim() || undefined;

  return {
    source: SOURCE,
    authorityId: formatNorbertAuthorityValue('person', id),
    kind: 'person',
    primaryName: row.can_name,
    searchStrings: names.map((n) => n.text),
    names,
    metadata: {
      dynasty: dynastyLabel,
      nationality,
      origin: origins.length ? origins : undefined,
      appointments: appointments.length ? appointments : undefined,
      nobleTitles: nobleTitles.length ? nobleTitles : undefined,
      ana: row.mythical ? 'mythical' : 'historical',
      description: norbertPersonClue({
        name: row.can_name,
        dynastyChn: dynastyLabel,
        dynastyEn,
        extra: sourceDescription,
      }),
      sourceDescription,
    },
  };
}
