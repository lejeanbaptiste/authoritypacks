import { norbertPersonClue } from '../shared/clue.mjs';
import { personNameEntriesFromNorbert } from './personNames.mjs';
import { SOURCE } from './constants.mjs';
import { nationalityFromDynasties } from '../shared/nationality.mjs';
import { nationalityAssertion } from '../shared/nationalityConcordance.mjs';

/** @typedef {import('../shared/types.mjs').AuthorityCandidate} AuthorityCandidate */

/**
 * @param {any[][]} personRows
 * @param {any[][]} nameRows
 * @param {any[][]} dynastyRows
 * @param {any[][]} dateFilterRows
 * @param {any[][]} natRawRows
 * @returns {AuthorityCandidate[]}
 */
export function compileNorbertPersons(
  personRows,
  nameRows,
  dynastyRows,
  dateFilterRows,
  natRawRows,
) {
  /** @type {Map<number, string>} */
  const dynastyById = new Map();
  for (const row of dynastyRows) {
    dynastyById.set(row[0], row[1]);
  }

  /** @type {Map<number, { birth?: number, death?: number, dynasty?: string, en?: string, start?: number, end?: number }>} */
  const datesByPerson = new Map();
  for (const row of dateFilterRows) {
    datesByPerson.set(row[0], {
      birth: row[1] ?? undefined,
      death: row[3] ?? undefined,
    });
  }

  /** @type {Map<number, number>} courtId -> count */
  /** @type {Map<number, Map<number, number>>} */
  const courtCountsByPerson = new Map();
  /** @type {Map<number, Set<number>>} */
  const nationalityIdsByPerson = new Map();
  for (const row of natRawRows) {
    const personId = row[2];
    const courtId = row[3];
    if (personId == null) continue;
    const dynastyId = row[6];
    if (dynastyId != null) {
      let ids = nationalityIdsByPerson.get(personId);
      if (!ids) { ids = new Set(); nationalityIdsByPerson.set(personId, ids); }
      ids.add(dynastyId);
    }
    if (courtId == null) continue;
    let counts = courtCountsByPerson.get(personId);
    if (!counts) {
      counts = new Map();
      courtCountsByPerson.set(personId, counts);
    }
    counts.set(courtId, (counts.get(courtId) ?? 0) + 1);
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

    const nameEntries = personNameEntriesFromNorbert({
      can_name: canName,
      names: namesByPerson.get(id) ?? [],
    });
    if (!nameEntries.length) continue;

    const dates = datesByPerson.get(id);
    let dynastyLabel;
    let dynastyEn;
    let dynastyStart;
    let dynastyEnd;
    const courtCounts = courtCountsByPerson.get(id);
    if (courtCounts?.size) {
      const courtId = [...courtCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const dynRow = dynastyRows.find((d) => d[0] === courtId);
      if (dynRow) {
        dynastyLabel = dynRow[1] ?? undefined;
        dynastyEn = dynRow[2] ?? undefined;
        dynastyStart = dynRow[3] ?? undefined;
        dynastyEnd = dynRow[4] ?? undefined;
      }
    }

    const startYear = dates?.birth ?? dynastyStart;
    const endYear = dates?.death ?? dynastyEnd;
    const nationality = nationalityFromDynasties(
      [...(nationalityIdsByPerson.get(id) ?? [])].map((dynId) => {
        const d = dynastyRows.find((row) => row[0] === dynId);
        return d ? { label: d[1], startYear: d[3], endYear: d[4] } : null;
      }).filter(Boolean),
      { startYear: dates?.birth, endYear: dates?.death },
    );

    out.push({
      source: SOURCE,
      authorityId: String(id),
      kind: 'person',
      primaryName: canName,
      searchStrings: nameEntries.map((entry) => entry.text),
      names: nameEntries,
      metadata: {
        dynasty: dynastyLabel,
        nationality: nationality.map((label) => nationalityAssertion({ source: 'Norbert', id: `dynasty:${label}`, label })),
        dateSource: dates?.birth != null || dates?.death != null ? 'fine' : 'nationality',
        startYear,
        endYear,
        ana: mythical ? 'mythical' : 'historical',
        description: norbertPersonClue({
          name: canName,
          birthYear: dates?.birth,
          deathYear: dates?.death,
          dynastyChn: dynastyLabel,
          dynastyEn,
          extra: description ? String(description).trim() : undefined,
        }),
      },
    });
  }
  return out;
}
