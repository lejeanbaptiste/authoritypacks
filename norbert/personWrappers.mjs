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
 *
 * String-generation breadth mirrors the old Norbert project's `nt_combos`
 * (taggingFunctions.py): for a title with both a surname and a given name on
 * file, princes/kings/etc. get *two* wrapper forms — title + given name alone
 * (封爵名, e.g. 建安王休仁) and title + surname + given name (封爵姓名, e.g.
 * 建安王劉休仁) — plus the title-only rank-and-name forms for 太子/皇太子
 * (太子名/皇太子名, no fief) and the surname+氏 consort/dowager form
 * (皇太后/皇太妃 + surname + 氏). Unlike the old project, each identity is
 * still a distinct `metadata.wrapper.components.persName` on its own record
 * (never a flat/undecomposed tag) — nothing about how a matched wrapper gets
 * decomposed into `<nobleTitle>`/`<persName>` downstream changes.
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
    posthumousAbbr: clean(row[5]),
    rank: clean(row[6]),
    temple: clean(row[7]),
    placeId: clean(row[9]),
    startYear: row[10] == null ? undefined : Number(row[10]),
    endYear: row[11] == null ? undefined : Number(row[11]),
    dynastyId: row[12] == null ? undefined : row[12],
  };
}

/** Deduped, cleaned name strings of the given typed kind(s) for one person. */
function namesOfType(person, types) {
  const wanted = new Set(types);
  return [
    ...new Set(
      (person?.names ?? [])
        .filter((name) => wanted.has(name.type))
        .map((name) => name.text)
        .filter(Boolean)
        .map(clean),
    ),
  ];
}

/** Ranks that also take a bare (fief-less) rank + given-name form, e.g. 太子勇, 皇太子勇. */
const BARE_RANK_WITH_NAME = new Set(['太子']);

/** Consort/dowager ranks matched as 皇 + rank + surname + 氏, e.g. 皇太后常氏. */
const CONSORT_SURNAME_RANKS = new Set(['太后', '太妃']);

/**
 * The dynasty/fief/title × identity-name search strings for one (title row,
 * identity name) pair — the same "longest-first" forms the old project's
 * `nt_combos` generated: full dynasty+fief form, bare fief form, and, when a
 * posthumous-name abbreviation exists, the same two again using it.
 */
function titleNameStrings(parts, title, abbreviatedTitle, name) {
  const strings = [];
  const dynastyAndFief =
    parts.dynasty === parts.fief ? [parts.dynasty] : [parts.dynasty, parts.fief];
  add(strings, [...dynastyAndFief, title, name].filter(Boolean).join(''));
  add(strings, [parts.fief, title, name].filter(Boolean).join(''));
  if (abbreviatedTitle) {
    add(strings, [...dynastyAndFief, abbreviatedTitle, name].filter(Boolean).join(''));
    add(strings, [parts.fief, abbreviatedTitle, name].filter(Boolean).join(''));
  }
  add(strings, [...dynastyAndFief, parts.rank, name].filter(Boolean).join(''));
  add(strings, [parts.fief, parts.rank, name].filter(Boolean).join(''));
  return strings;
}

/**
 * @param {any[][]} titleRows
 * @param {Map<number|string, { primaryName: string, names?: { text: string, type?: string }[] }>} peopleById
 */
export function compileNorbertPersonWrappers(titleRows, peopleById) {
  const records = [];

  for (const row of titleRows) {
    const parts = titleParts(row);
    if (parts.personId == null) continue;
    const person = peopleById.get(parts.personId) ?? peopleById.get(String(parts.personId));

    const givenNames = namesOfType(person, ['given']);
    const familyNames = namesOfType(person, ['family']);
    // A wrapper's final component must be an asserted persName. In
    // particular, do not fall back to `person.primaryName`: Norbert's
    // headword can be an empress title rather than a name.
    const fallbackNames = namesOfType(person, ['primary', 'wrapper-person']);

    // Prince/king-style identities: given name alone, and — separately —
    // surname+given name, each becoming its own record (and so its own fixed
    // `components.persName`) rather than mixing name forms into one record.
    /** @type {string[]} */
    const identities = [];
    for (const given of givenNames) identities.push(given);
    for (const family of familyNames) {
      for (const given of givenNames) identities.push(`${family}${given}`);
    }
    if (identities.length === 0) identities.push(...fallbackNames);

    const title = [parts.posthumous, parts.rank].filter(Boolean).join('');
    const abbreviatedTitle = [parts.posthumousAbbr, parts.rank].filter(Boolean).join('');

    const emit = (idSuffix, strings, identityText, componentOverrides = {}) => {
      if (strings.length === 0 || !identityText) return;
      records.push({
        source: SOURCE,
        authorityId: `noble-title:${parts.titleRowId}${idSuffix}`,
        kind: 'person',
        primaryName: strings[0],
        searchStrings: strings,
        names: [{ text: identityText, type: 'wrapper-person' }],
        metadata: {
          wrapper: {
            personId: formatNorbertAuthorityValue('person', parts.personId),
            titleRowId: String(parts.titleRowId),
            components: {
              ...(parts.dynasty ? { nationality: parts.dynasty } : {}),
              ...(parts.fief ? { fief: parts.fief } : {}),
              ...(parts.rank ? { roleName: parts.rank } : {}),
              ...(parts.posthumous ? { posthumousName: parts.posthumous } : {}),
              ...(parts.posthumousAbbr ? { posthumousNameAbbr: parts.posthumousAbbr } : {}),
              ...(parts.temple ? { templeName: parts.temple } : {}),
              ...componentOverrides,
              persName: identityText,
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
    };

    identities.forEach((identityText, index) => {
      const strings = titleNameStrings(parts, title, abbreviatedTitle, identityText);
      emit(identities.length > 1 ? `:${index}` : '', strings, identityText);
    });

    // 太子/皇太子 also take a bare rank + given name, no fief (nt_combos'
    // 太子名 / 皇太子名, e.g. 太子勇).
    if (BARE_RANK_WITH_NAME.has(parts.rank)) {
      const heirNames = givenNames.length > 0 ? givenNames : fallbackNames;
      for (const given of heirNames) {
        const strings = [];
        add(strings, `${parts.rank}${given}`);
        add(strings, `皇${parts.rank}${given}`);
        emit(`:heir:${given}`, strings, given, { fief: undefined });
      }
    }

    // Consort/dowager: rank + surname + 氏 (nt_combos' 皇太后, e.g. 皇太后常氏)
    // — the identity here is the surname, not a given name.
    if (CONSORT_SURNAME_RANKS.has(parts.rank)) {
      for (const family of familyNames) {
        const identityText = `${family}氏`;
        emit(`:consort:${family}`, [`皇${parts.rank}${identityText}`], identityText, {
          fief: undefined,
        });
      }
    }
  }

  return records;
}
