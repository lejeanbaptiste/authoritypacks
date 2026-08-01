import { SOURCE } from './constants.mjs';
import { formatNorbertAuthorityValue } from './norbertAuthorityId.mjs';

/** `person_offices` columns in the Norbert MySQL dump. */
const COL = {
  id: 0,
  personId: 1,
  officeName: 2,
  source: 12,
};

/**
 * Compile Norbert's person_offices table into source-preserving assertions.
 * Dates and bio_seq are intentionally not exported yet; this pack is used to
 * enrich person disambiguation records, not to display a career chronology.
 *
 * @param {any[][]} rows
 * @param {import('../shared/types.mjs').AuthorityCandidate[]} offices
 */
export function compileNorbertAppointments(rows, offices) {
  const officesByName = new Map();
  for (const office of offices) {
    const list = officesByName.get(office.primaryName) ?? [];
    list.push(office);
    officesByName.set(office.primaryName, list);
  }

  return rows.flatMap((row, index) => {
    const personId = row[COL.personId];
    const officeName = row[COL.officeName] == null
      ? ''
      : String(row[COL.officeName]).trim();
    if (personId == null || !officeName) return [];

    const matches = officesByName.get(officeName) ?? [];
    const office = matches.length === 1 ? matches[0] : undefined;
    const sourceRef = row[COL.source];
    return [{
      source: SOURCE,
      authorityId: String(row[COL.id] ?? `person_offices:${index}`),
      person: { source: SOURCE, authorityId: formatNorbertAuthorityValue('person', personId) },
      office: {
        source: SOURCE,
        ...(office ? {
          authorityId: office.authorityId,
        } : {}),
        name: officeName,
      },
      ...(sourceRef ? { sourceRef: String(sourceRef) } : {}),
    }];
  });
}
