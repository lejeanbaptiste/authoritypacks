import { addSearchString } from '../shared/normalize.mjs';
import { dilaPersonClue, dilaPlaceClue, conciseFirstClause, yearFromTeiDate } from '../shared/clue.mjs';
import { resolveDynastyByLabel } from '../shared/dynastyMap.mjs';
import { asArray, hantNames, notesOfType, textContent, teiId } from '../shared/teiParse.mjs';

/** @typedef {import('../shared/types.mjs').AuthorityCandidate} AuthorityCandidate */

/**
 * @param {Record<string, unknown>} person
 * @param {{ dynastyMap: ReturnType<typeof import('../shared/dynastyMap.mjs').loadCbdbDynastyMap> }} ctx
 * @returns {AuthorityCandidate | null}
 */
export function personFromRecord(person, ctx) {
  const authorityId = teiId(person);
  if (!authorityId) return null;

  const names = hantNames(person, 'persName');
  if (!names.length) return null;

  /** @type {Set<string>} */
  const searchStrings = new Set();
  for (const n of names) addSearchString(searchStrings, n);

  const dynastyNote = notesOfType(person, 'dynasty')[0];
  const dynastyRange = resolveDynastyByLabel(dynastyNote, ctx.dynastyMap);

  const birthYear = yearFromTeiDate(textContent(person.birth));
  const deathYear = yearFromTeiDate(textContent(person.death));
  const concise = notesOfType(person, 'concise')[0];
  const occupation = textContent(person.occupation) || undefined;

  const crosswalk = extractCrosswalk(person);

  const disambiguation = notesOfType(person, 'disambiguation')[0];

  /** @type {AuthorityCandidate} */
  const candidate = {
    source: 'DILA',
    authorityId: String(authorityId),
    kind: 'person',
    primaryName: names[0],
    searchStrings: [...searchStrings],
    metadata: {
      dynasty: dynastyNote,
      startYear: birthYear ?? dynastyRange?.startYear,
      endYear: deathYear ?? dynastyRange?.endYear,
      description: dilaPersonClue({
        name: names[0],
        birthYear,
        deathYear,
        dynasty: dynastyNote,
        occupation,
        conciseFirstClause: conciseFirstClause(concise),
      }),
      ana: person['@_ana'] ? String(person['@_ana']) : undefined,
      crosswalk: Object.keys(crosswalk).length ? crosswalk : undefined,
      disambiguation: disambiguation || undefined,
    },
  };

  return candidate;
}

/** @param {Record<string, unknown>} person */
function extractCrosswalk(person) {
  /** @type {{ cbdb?: string, wikidata?: string[] }} */
  const crosswalk = {};
  for (const idno of asArray(person.idno)) {
    const type = idno?.['@_type'];
    const value = textContent(idno);
    if (!type || !value) continue;
    if (type === 'CBDB') crosswalk.cbdb = value.replace(/^0+/, '') || value;
    if (type === 'Wikidata') {
      crosswalk.wikidata = crosswalk.wikidata ?? [];
      crosswalk.wikidata.push(value);
    }
  }
  return crosswalk;
}

/**
 * @param {Record<string, unknown>} place
 * @param {{ districtMap: Map<string, string> }} ctx
 * @returns {AuthorityCandidate | null}
 */
export function placeFromRecord(place, ctx) {
  const authorityId = teiId(place);
  if (!authorityId) return null;

  const names = hantNames(place, 'placeName');
  if (!names.length) return null;

  /** @type {Set<string>} */
  const searchStrings = new Set();
  for (const n of names) addSearchString(searchStrings, n);

  const category = notesOfType(place, 'category')[0];
  const districtText = textContent(place.district);
  let district = districtText || undefined;
  const loc = asArray(place.location)[0];
  if (loc?.place?.['@_key']) {
    const fromMap = ctx.districtMap.get(String(loc.place['@_key']));
    if (fromMap) district = fromMap;
  }

  return {
    source: 'DILA',
    authorityId: String(authorityId),
    kind: 'place',
    primaryName: names[0],
    searchStrings: [...searchStrings],
    metadata: {
      subtype: category,
      description: dilaPlaceClue({ name: names[0], category, district }),
    },
  };
}
