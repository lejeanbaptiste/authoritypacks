import { norbertPersonClue } from '../shared/clue.mjs';
import {
  personNameEntriesFromNorbert,
  personSearchStringsFromNorbert,
} from './personNames.mjs';
import { SOURCE } from './constants.mjs';
import { nationalityFromDynasties } from '../shared/nationality.mjs';
import { nationalityAssertion } from '../shared/nationalityConcordance.mjs';
import { formatNorbertAuthorityValue } from './norbertAuthorityId.mjs';

/** @typedef {import('../shared/types.mjs').AuthorityCandidate} AuthorityCandidate */

/**
 * Accept either date_dynasties-style rows or a sanitize sidecar map.
 * @param {any[][] | Record<string, { zh: string, en?: string, startYear?: number, endYear?: number }> | undefined} labelsOrRows
 * @returns {Map<number, { zh: string, en?: string, startYear?: number, endYear?: number }>}
 */
function dynastyLookup(labelsOrRows) {
  /** @type {Map<number, { zh: string, en?: string, startYear?: number, endYear?: number }>} */
  const out = new Map();
  if (!labelsOrRows) return out;
  if (Array.isArray(labelsOrRows)) {
    for (const row of labelsOrRows) {
      if (row?.[0] == null) continue;
      const zh = row[1] == null ? '' : String(row[1]).trim();
      if (!zh) continue;
      const en = row[2] == null ? undefined : String(row[2]).trim() || undefined;
      out.set(Number(row[0]), {
        zh,
        ...(en ? { en } : {}),
        ...(row[3] != null ? { startYear: row[3] } : {}),
        ...(row[4] != null ? { endYear: row[4] } : {}),
      });
    }
    return out;
  }
  for (const [id, info] of Object.entries(labelsOrRows)) {
    if (!info?.zh) continue;
    out.set(Number(id), info);
  }
  return out;
}

/**
 * Build unique (person_id, dyn_id) pairs: person_dynasties first, then nat_raw.court_id.
 * @param {any[][]} personDynastyRows
 * @param {any[][]} natRawRows
 * @returns {{
 *   pairsByPerson: Map<number, Map<number, { evidence?: string }>>,
 *   courtCountsByPerson: Map<number, Map<number, number>>,
 * }}
 */
function collectNationalityPairs(personDynastyRows, natRawRows) {
  /** @type {Map<number, Map<number, { evidence?: string }>>} */
  const pairsByPerson = new Map();
  /** @type {Map<number, Map<number, number>>} */
  const courtCountsByPerson = new Map();

  /**
   * @param {number} personId
   * @param {number} dynId
   * @param {string | undefined} [evidence]
   */
  function addPair(personId, dynId, evidence) {
    if (personId == null || dynId == null) return;
    let byDyn = pairsByPerson.get(personId);
    if (!byDyn) {
      byDyn = new Map();
      pairsByPerson.set(personId, byDyn);
    }
    const existing = byDyn.get(dynId);
    if (!existing) byDyn.set(dynId, { ...(evidence ? { evidence } : {}) });
    else if (evidence && !existing.evidence) existing.evidence = evidence;
  }

  for (const row of personDynastyRows ?? []) {
    addPair(row[1], row[2]);
  }

  for (const row of natRawRows ?? []) {
    const personId = row[2];
    const courtId = row[3];
    const evidence = row[1] == null ? undefined : String(row[1]).trim() || undefined;
    if (personId == null) continue;
    if (courtId != null) {
      addPair(personId, courtId, evidence);
      let counts = courtCountsByPerson.get(personId);
      if (!counts) {
        counts = new Map();
        courtCountsByPerson.set(personId, counts);
      }
      counts.set(courtId, (counts.get(courtId) ?? 0) + 1);
    }
  }

  return { pairsByPerson, courtCountsByPerson };
}

/**
 * @param {any[][]} personRows
 * @param {any[][]} nameRows
 * @param {any[][] | Record<string, { zh: string, en?: string, startYear?: number, endYear?: number }>} dynastyLabelsOrRows
 * @param {any[][]} personDynastyRows Clean person↔dynasty links (`person_dynasties`).
 * @param {any[][]} natRawRows
 * @param {any[][]} originRows
 * @returns {AuthorityCandidate[]}
 */
export function compileNorbertPersons(
  personRows,
  nameRows,
  dynastyLabelsOrRows,
  personDynastyRows,
  natRawRows,
  originRows = [],
) {
  const dynasties = dynastyLookup(dynastyLabelsOrRows);
  const { pairsByPerson, courtCountsByPerson } = collectNationalityPairs(
    personDynastyRows ?? [],
    natRawRows ?? [],
  );

  /** @type {Map<number, import('../shared/types.mjs').OriginAssertion[]>} */
  const originsByPerson = new Map();
  for (const row of originRows) {
    const personId = row[1];
    const placeName = row[2] == null ? '' : String(row[2]).trim();
    if (personId == null || !placeName) continue;
    const assertion = {
      source: SOURCE,
      originType: 'jiguan',
      placeName,
      placeType: row[3] == null ? undefined : String(row[3]).trim() || undefined,
      qualification: row[4] == null ? undefined : String(row[4]).trim() || undefined,
      sourceRef: row[5] == null ? undefined : String(row[5]).trim() || undefined,
    };
    const list = originsByPerson.get(personId) ?? [];
    list.push(assertion);
    originsByPerson.set(personId, list);
  }

  /** @type {Map<number, { type: number, value: string }[]>} */
  const namesByPerson = new Map();
  for (const row of nameRows) {
    const personId = row[1];
    const name = row[2];
    const type = row[3];
    if (personId == null || name == null || type == null) continue;
    let list = namesByPerson.get(personId);
    if (!list) {
      list = [];
      namesByPerson.set(personId, list);
    }
    list.push({ type, value: name });
  }

  /** @type {AuthorityCandidate[]} */
  const out = [];
  for (const row of personRows) {
    const id = row[0];
    const canName = row[1];
    const description = row[3];
    const mythical = row[4];
    if (!canName || !String(canName).trim()) continue;

    const personNameInput = {
      can_name: canName,
      names: namesByPerson.get(id) ?? [],
    };
    // Intake names keep single-character 姓/名 and other typed rows;
    // searchStrings alone apply tag-bomb length / block filters.
    const nameEntries = personNameEntriesFromNorbert(personNameInput);
    if (!nameEntries.length) continue;
    const searchStrings = personSearchStringsFromNorbert(personNameInput);

    let dynastyLabel;
    let dynastyEn;
    const courtCounts = courtCountsByPerson.get(id);
    if (courtCounts?.size) {
      const courtId = [...courtCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const dyn = dynasties.get(Number(courtId));
      if (dyn) {
        dynastyLabel = dyn.zh;
        dynastyEn = dyn.en;
      }
    }
    if (!dynastyLabel) {
      const firstDynId = pairsByPerson.get(id)?.keys().next().value;
      if (firstDynId != null) {
        const dyn = dynasties.get(Number(firstDynId));
        if (dyn) {
          dynastyLabel = dyn.zh;
          dynastyEn = dyn.en;
        }
      }
    }

    const pairMeta = pairsByPerson.get(id) ?? new Map();
    const nationalityLabels = nationalityFromDynasties(
      [...pairMeta.keys()].map((dynId) => {
        const d = dynasties.get(Number(dynId));
        return d
          ? { label: d.zh, startYear: d.startYear, endYear: d.endYear }
          : null;
      }).filter(Boolean),
      {},
    );
    const nationality = nationalityLabels.map((label) => {
      const dynId = [...pairMeta.keys()].find((idKey) => dynasties.get(Number(idKey))?.zh === label);
      const evidence = dynId != null ? pairMeta.get(dynId)?.evidence : undefined;
      const assertion = nationalityAssertion({
        source: 'Norbert',
        id: dynId != null ? `dynasty:${dynId}` : `dynasty:${label}`,
        label,
      });
      return evidence ? { ...assertion, evidence } : assertion;
    });

    const sourceDescription = description == null ? undefined : String(description).trim() || undefined;

    out.push({
      source: SOURCE,
      authorityId: formatNorbertAuthorityValue('person', id),
      kind: 'person',
      primaryName: canName,
      searchStrings,
      names: nameEntries,
      metadata: {
        dynasty: dynastyLabel,
        nationality,
        origin: originsByPerson.get(id),
        ana: mythical ? 'mythical' : 'historical',
        // Pack disambiguation clue (name + dynasty + Norbert text).
        description: norbertPersonClue({
          name: canName,
          dynastyChn: dynastyLabel,
          dynastyEn,
          extra: sourceDescription,
        }),
        // Plain Norbert `person.description` for entity-DB one-line notes.
        sourceDescription,
      },
    });
  }
  return out;
}
