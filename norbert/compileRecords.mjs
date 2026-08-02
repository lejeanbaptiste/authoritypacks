import { norbertPersonClue } from '../shared/clue.mjs';
import { normalizeSurface } from '../shared/normalize.mjs';
import { isMissingNameToken } from '../shared/personStringPolicy.mjs';
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
 * Norbert sometimes records an empress's rank as the bare `后` while the
 * person headword carries the complete posthumous title (e.g. 孝元皇后).
 * Preserve the whole title structurally instead of treating the headword as a
 * personal name.
 */
function nobleTitleFromRow(row, displayName) {
  const clean = (value) => value == null ? undefined : String(value).trim() || undefined;
  const fief = clean(row[3]);
  const rawPosthumous = clean(row[4]);
  const posthumousNameAbbr = clean(row[5]);
  let roleName = clean(row[6]);
  let posthumousName = rawPosthumous;
  const label = clean(displayName);
  if (!fief && !posthumousName && label && roleName) {
    // `后` is the abbreviated database rank; 皇后 is the title actually
    // carried by the canonical display/headword.
    if (roleName === '后' && label.endsWith('皇后')) roleName = '皇后';
    if (label.endsWith(roleName) && label.length > roleName.length) {
      posthumousName = label.slice(0, -roleName.length) || undefined;
    }
  }
  if (![fief, roleName, posthumousName].some(Boolean)) return null;
  return {
    fief,
    roleName,
    posthumousName,
    ...(posthumousNameAbbr ? { posthumousNameAbbr } : {}),
  };
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
  titleRows = [],
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

  const titlesByPerson = new Map();
  for (const row of titleRows) {
    const personId = row[1];
    if (personId == null) continue;
    const list = titlesByPerson.get(personId) ?? [];
    list.push(row);
    titlesByPerson.set(personId, list);
  }

  /** @type {AuthorityCandidate[]} */
  const out = [];
  for (const row of personRows) {
    const id = row[0];
    const rawCanName = row[1] == null ? '' : String(row[1]);
    const description = row[3];
    const mythical = row[4];
    const canNameNorm = normalizeSurface(rawCanName);
    const canNameUsable = Boolean(canNameNorm) && !isMissingNameToken(canNameNorm);
    const altRows = namesByPerson.get(id) ?? [];
    // Skip rows with no usable canonical name and no altname rows at all.
    if (!canNameUsable && altRows.length === 0) continue;

    const familyName = altRows.find((entry) => entry.type === 0)?.value;
    const givenName = altRows.find((entry) => entry.type === 1)?.value;
    const structuredPersonalName = normalizeSurface(`${familyName ?? ''}${givenName ?? ''}`);
    // `can_name` is a persName only when Norbert's separate 姓 and 名 fields
    // reconstruct it exactly.  Otherwise it is retained as the record's
    // display/headword (often a title) but never injected into names[].
    const canNameIsPersonalName =
      canNameUsable && Boolean(familyName && givenName) && structuredPersonalName === canNameNorm;
    const personNameInput = {
      can_name: canNameIsPersonalName ? canNameNorm : '',
      names: altRows,
    };
    // Intake names keep single-character 姓/名 and other typed rows;
    // searchStrings alone apply tag-bomb length / block filters.
    const nameEntriesRaw = personNameEntriesFromNorbert(personNameInput).filter(
      // An unstructured row duplicating a title headword is not evidence that
      // the title is a persName.  `displayName` retains it for the UI.
      (entry) => canNameIsPersonalName || entry.text !== canNameNorm,
    );
    const searchStrings = personSearchStringsFromNorbert(personNameInput);
    let primaryName =
      canNameUsable
        ? canNameNorm
        : nameEntriesRaw.find((e) => e.type === 'primary')?.text ??
          nameEntriesRaw[0]?.text;
    if (!primaryName || isMissingNameToken(primaryName)) continue;
    // When can_name was the dump token "nan", promote the fallback surface to primary.
    const nameEntries =
      canNameUsable || nameEntriesRaw.some((e) => e.type === 'primary' && e.text === primaryName)
        ? nameEntriesRaw
        : [
            { text: primaryName, type: 'primary' },
            ...nameEntriesRaw.filter((e) => e.text !== primaryName),
          ];

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
    const nobleTitles = (titlesByPerson.get(id) ?? [])
      .map((titleRow) => nobleTitleFromRow(titleRow, primaryName))
      .filter(Boolean);

    out.push({
      source: SOURCE,
      authorityId: formatNorbertAuthorityValue('person', id),
      kind: 'person',
      primaryName,
      // Norbert's can_name is the source's chosen display surface. It may be
      // a noble title, so it is deliberately separate from typed persName.
      displayName: primaryName,
      // A title headword remains searchable, but is intentionally absent
      // from names[] unless typed 姓 + 名 proved it is a personal name.
      searchStrings: searchStrings.length ? searchStrings : [primaryName],
      names: nameEntries,
      metadata: {
        dynasty: dynastyLabel,
        nationality,
        origin: originsByPerson.get(id),
        ana: mythical ? 'mythical' : 'historical',
        // Pack disambiguation clue (name + dynasty + Norbert text).
        description: norbertPersonClue({
          name: primaryName,
          dynastyChn: dynastyLabel,
          dynastyEn,
          extra: sourceDescription,
        }),
        // Plain Norbert `person.description` for entity-DB one-line notes.
        sourceDescription,
        ...(nobleTitles.length ? { nobleTitles } : {}),
      },
    });
  }
  return out;
}
