import { SOURCE } from './constants.mjs';
import { formatNorbertAuthorityValue } from './norbertAuthorityId.mjs';

/**
 * Build transient, wrapper-ready person combinations from Norbert's
 * person_nt table. The row layout is the SQL table layout:
 * ind, person_id, dyn, fief, pn, pn_abr, nt, tn, 戶, place_id, start_year,
 * end_year, dyn_id, ...
 *
 * These are matcher records, not person entities. They intentionally retain
 * the component fields needed to emit nested TEI later.
 */

const clean = (value) => {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text || undefined;
};

const add = (out, value) => {
  const text = clean(value);
  if (text && !out.includes(text)) out.push(text);
};

/** @param {any[]} row */
function titleParts(row) {
  return {
    titleRowId: row[0],
    personId: row[1],
    dynasty: clean(row[2]),
    fief: clean(row[3]),
    posthumous: clean(row[4]),
    rank: clean(row[6]),
    temple: clean(row[7]),
    placeId: clean(row[9]),
    startYear: row[10] == null ? undefined : Number(row[10]),
    endYear: row[11] == null ? undefined : Number(row[11]),
    dynastyId: row[12] == null ? undefined : row[12],
  };
}

/**
 * @param {any[][]} titleRows
 * @param {Map<number|string, { primaryName: string, names?: { text: string, type?: string }[] }>} peopleById
 */
export function compileNorbertPersonWrappers(titleRows, peopleById) {
  const records = [];

  for (const row of titleRows) {
    const parts = titleParts(row);
    const person = peopleById.get(parts.personId) ?? peopleById.get(String(parts.personId));
    const personalNames = [...new Set([
      person?.primaryName,
      ...(person?.names ?? []).map((name) => name.text),
    ].filter(Boolean).map(clean))];
    const personalName = personalNames[0];
    if (parts.personId == null || !personalName) continue;

    const title = [parts.posthumous, parts.rank].filter(Boolean).join('');
    const strings = [];
    for (const name of personalNames) {
      // Norbert's useful title/person forms, from longest to shorter forms.
      const dynastyAndFief = parts.dynasty === parts.fief ? [parts.dynasty] : [parts.dynasty, parts.fief];
      add(strings, [...dynastyAndFief, title, name].filter(Boolean).join(''));
      add(strings, [parts.fief, title, name].filter(Boolean).join(''));
      add(strings, [...dynastyAndFief, parts.rank, name].filter(Boolean).join(''));
      add(strings, [parts.fief, parts.rank, name].filter(Boolean).join(''));
    }
    if (strings.length === 0) continue;

    records.push({
      source: SOURCE,
      authorityId: `noble-title:${parts.titleRowId}`,
      kind: 'person',
      primaryName: strings[0],
      searchStrings: strings,
      names: personalNames.map((text) => ({ text, type: 'wrapper-person' })),
      metadata: {
        wrapper: {
          personId: formatNorbertAuthorityValue('person', parts.personId),
          titleRowId: String(parts.titleRowId),
          components: {
            ...(parts.dynasty ? { nationality: parts.dynasty } : {}),
            ...(parts.fief ? { fief: parts.fief } : {}),
            ...(parts.rank ? { roleName: parts.rank } : {}),
            ...(parts.posthumous ? { posthumousName: parts.posthumous } : {}),
            ...(parts.temple ? { templeName: parts.temple } : {}),
            persName: personalName,
          },
          ...(parts.placeId ? { fiefPlaceId: parts.placeId } : {}),
        },
        dynasty: parts.dynasty,
        startYear: parts.startYear,
        endYear: parts.endYear,
        dateSource: parts.startYear != null || parts.endYear != null ? 'fine' : undefined,
        crosswalk: { norbert: String(parts.personId) },
        isNobleTitle: true,
      },
    });
  }

  return records;
}
