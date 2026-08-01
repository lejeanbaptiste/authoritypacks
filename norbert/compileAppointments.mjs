import { SOURCE } from './constants.mjs';
import { formatNorbertAuthorityValue } from './norbertAuthorityId.mjs';

/** `officeholding_raw` columns in the Norbert MySQL dump. */
const COL = {
  id: 0,
  officeName: 5,
  personId: 7, // recipient_id
  officeId: 8,
  source: 37,
};

/**
 * Compile Norbert's officeholding_raw table into source-preserving assertions.
 * Dates and bio_seq are intentionally not exported yet; this pack is used to
 * enrich person disambiguation records, not to display a career chronology.
 *
 * @param {any[][]} rows
 * @param {import('../shared/types.mjs').AuthorityCandidate[]} offices
 */
export function compileNorbertAppointments(rows, offices) {
  const officesById = new Map();
  const officesByName = new Map();
  for (const office of offices) {
    const bare = String(office.authorityId).replace(/^office[-:]/i, '');
    officesById.set(bare, office);
    officesById.set(String(office.authorityId), office);
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

    let office = row[COL.officeId] != null
      ? officesById.get(String(row[COL.officeId]))
      : undefined;
    if (!office) {
      const matches = officesByName.get(officeName) ?? [];
      office = matches.length === 1 ? matches[0] : undefined;
    }
    const sourceRef = row[COL.source];
    return [{
      source: SOURCE,
      authorityId: String(row[COL.id] ?? `officeholding_raw:${index}`),
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
