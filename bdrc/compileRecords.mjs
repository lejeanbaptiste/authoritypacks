/**
 * Compile cleaned BDRC name CSV rows → LJB AuthorityCandidate records.
 *
 * Tagging uses Tibetan script (`bo`) only. Wylie stays in typed `names[]` as
 * `romanization` and is never emitted as a searchString.
 */
import { addSearchString, normalizeSurface } from '../shared/normalize.mjs';

export const BDRC_RESOURCE_REF = 'http://purl.bdrc.io/resource/';

/** BDRC person name types that may seed corpus auto-tagging. */
export const PERSON_NT_TAGGABLE = new Set([
  'PersonPrimaryName',
  'PersonPersonalName',
  'PersonCommonName',
  'PersonOtherName',
  'PersonVariantOrthography',
  'PersonPenName',
  'PersonFirstOrdinationName',
  'PersonFinalOrdinationName',
  'PersonFinalOrdination',
  'PersonBodhisattvaVowName',
  'PersonSecretInitiatoryName',
]);

/** Title / office strings — kept for intake, excluded from searchStrings. */
export const PERSON_NT_TITLE = new Set([
  'PersonTitle',
  'PersonPrimaryTitle',
  'PersonTulkuTitle',
  'PersonOfficeTitle',
  'PersonOfficialTitle',
  'PersonGterStonTitle',
  'PersonReversal',
  'PersonGrammatical',
]);

/** @type {Record<string, string>} */
export const PERSON_NT_TO_NAME_TYPE = {
  PersonPrimaryName: 'primary',
  PersonPersonalName: 'variant',
  PersonCommonName: 'variant',
  PersonOtherName: 'variant',
  PersonVariantOrthography: 'variant',
  PersonPenName: 'pen',
  PersonFamilyName: 'family',
  PersonFirstOrdinationName: 'dharma',
  PersonFinalOrdinationName: 'dharma',
  PersonFinalOrdination: 'dharma',
  PersonBodhisattvaVowName: 'dharma',
  PersonSecretInitiatoryName: 'dharma',
  PersonTitle: 'variant',
  PersonPrimaryTitle: 'variant',
  PersonTulkuTitle: 'variant',
  PersonOfficeTitle: 'variant',
  PersonOfficialTitle: 'variant',
  PersonGterStonTitle: 'variant',
  PersonReversal: 'variant',
  PersonGrammatical: 'variant',
};

const PRIMARY_NAME_NT_ORDER = [
  'PersonPrimaryName',
  'PersonPersonalName',
  'PersonCommonName',
  'PersonOtherName',
  'PersonPrimaryTitle',
  'PersonTitle',
  'PersonTulkuTitle',
];

/**
 * @param {string | null | undefined} raw
 */
export function cleanBoSurface(raw) {
  let s = normalizeSurface(raw ?? '');
  while (s.endsWith('/')) s = s.slice(0, -1).trimEnd();
  return normalizeSurface(s);
}

/**
 * @param {string | null | undefined} raw
 */
export function cleanWylieSurface(raw) {
  let s = normalizeSurface((raw ?? '').replace(/\*/g, ''));
  while (s.endsWith('/')) s = s.slice(0, -1).trimEnd();
  return normalizeSurface(s);
}

/**
 * @param {string} nt
 */
export function nameTypeForPersonNt(nt) {
  return PERSON_NT_TO_NAME_TYPE[nt] ?? 'variant';
}

/**
 * @param {{ p: string, n: string, nt: string, bo: string }[]} rows
 * @returns {import('../shared/types.mjs').AuthorityCandidate | null}
 */
export function personFromRows(authorityId, rows) {
  if (!authorityId || !rows.length) return null;

  /** @type {Set<string>} */
  const searchStrings = new Set();
  /** @type {import('../shared/types.mjs').NameEntry[]} */
  const names = [];
  const seenNames = new Set();

  const addName = (text, type, lang) => {
    const key = `${type}\0${lang ?? ''}\0${text}`;
    if (!text || seenNames.has(key)) return;
    seenNames.add(key);
    names.push({ text, type, ...(lang ? { lang } : {}) });
  };

  for (const row of rows) {
    const bo = cleanBoSurface(row.bo);
    const wylie = cleanWylieSurface(row.n);
    const nameType = nameTypeForPersonNt(row.nt);

    if (bo) addName(bo, nameType, 'bo');
    if (wylie) addName(wylie, 'romanization', 'bo-x-ewts');

    if (bo && PERSON_NT_TAGGABLE.has(row.nt)) {
      addSearchString(searchStrings, bo, { script: 'tibt' });
    }
  }

  if (searchStrings.size === 0) return null;

  const primaryName = pickPrimaryBo(rows) ?? [...searchStrings][0];
  if (!primaryName) return null;

  return {
    source: 'BDRC',
    authorityId,
    kind: 'person',
    primaryName,
    searchStrings: [...searchStrings],
    names,
    metadata: {
      description: `${primaryName} (BDRC ${authorityId})`,
      crosswalk: { bdrc: authorityId },
      sourceRef: `${BDRC_RESOURCE_REF}${authorityId}`,
    },
  };
}

/**
 * @param {{ p: string, n: string, nt: string, bo: string }[]} rows
 */
function pickPrimaryBo(rows) {
  for (const nt of PRIMARY_NAME_NT_ORDER) {
    const candidates = rows
      .filter((row) => row.nt === nt)
      .map((row) => cleanBoSurface(row.bo))
      .filter(Boolean);
    if (candidates.length) return mostSyllabic(candidates);
  }
  const candidates = rows.map((row) => cleanBoSurface(row.bo)).filter(Boolean);
  return candidates.length ? mostSyllabic(candidates) : null;
}

/**
 * BDRC occasionally lists duplicate encodings of the same name within one
 * name-type tier — a properly tsheg-delimited form alongside a glued/malformed
 * one (e.g. a Wylie source missing its inter-syllable spaces). Prefer the
 * form with the most tsheg-separated syllables, since it preserves the most
 * information; ties keep the first-encountered (CSV) order.
 * @param {string[]} candidates
 */
function mostSyllabic(candidates) {
  return candidates.reduce((best, candidate) =>
    candidate.split('་').length > best.split('་').length ? candidate : best,
  );
}

/**
 * @param {string} authorityId
 * @param {{ p: string, n: string, nt: string, bo: string }[]} rows
 * @returns {import('../shared/types.mjs').AuthorityCandidate | null}
 */
export function placeFromRows(authorityId, rows) {
  if (!authorityId || !rows.length) return null;

  /** @type {Set<string>} */
  const searchStrings = new Set();
  /** @type {import('../shared/types.mjs').NameEntry[]} */
  const names = [];
  const seenNames = new Set();

  for (const row of rows) {
    const bo = cleanBoSurface(row.bo);
    const wylie = cleanWylieSurface(row.n);
    if (bo) {
      const key = `primary\0bo\0${bo}`;
      if (!seenNames.has(key)) {
        seenNames.add(key);
        names.push({ text: bo, type: 'primary', lang: 'bo' });
      }
      addSearchString(searchStrings, bo, { script: 'tibt' });
    }
    if (wylie) {
      const key = `romanization\0bo-x-ewts\0${wylie}`;
      if (!seenNames.has(key)) {
        seenNames.add(key);
        names.push({ text: wylie, type: 'romanization', lang: 'bo-x-ewts' });
      }
    }
  }

  if (searchStrings.size === 0) return null;

  const primaryName = [...searchStrings][0];
  return {
    source: 'BDRC',
    authorityId,
    kind: 'place',
    primaryName,
    searchStrings: [...searchStrings],
    names,
    metadata: {
      description: `${primaryName} (BDRC ${authorityId})`,
      crosswalk: { bdrc: authorityId },
      sourceRef: `${BDRC_RESOURCE_REF}${authorityId}`,
    },
  };
}
