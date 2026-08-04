/** Shared helpers for tiered Norbert person concordance. */
import { normalizeSurface } from '../shared/normalize.mjs';
import { STATIC_DYNASTY_ALIASES, normalizeDynastyLabel } from '../shared/dynastyMap.mjs';
import { formatNorbertAuthorityValue } from './norbertAuthorityId.mjs';
import { sortSurnamesLongestFirst } from './surnames.mjs';

export const TANG_START_YEAR = 618;

export const STYLE_TYPES = new Set(['courtesy', '字', 'style', 'styleName']);
export const TEMPLE_TYPES = new Set(['temple', '廟號']);
export const POSTHUMOUS_TYPES = new Set(['posthumous', '諡', '諡號']);
export const FAMILY_TYPES = new Set(['family', '姓']);
export const GIVEN_TYPES = new Set(['given', '名']);

/** Settled Tier 1C rank allowlist. */
export const RULER_RANKS = new Set(['帝', '皇帝', '天皇', '后', '皇后', '太后', '太子']);

export const SEP = '||';
export const MIN_STYLE_LEN = 2;

/** @param {unknown} value */
export function keyPart(value) {
  return normalizeSurface(String(value ?? '')).replace(/[·．。\s]/g, '');
}

/**
 * Strip CBDB-style `姓名(廟號/稱號)` packaging.
 * @param {string} primary
 * @returns {{ personal: string, paren: string | null }}
 */
export function splitParentheticalPrimary(primary) {
  const raw = keyPart(primary);
  const m = raw.match(/^(.+?)[\(（]([^\)）]+)[\)）]$/u);
  if (!m) return { personal: raw, paren: null };
  return { personal: keyPart(m[1]), paren: keyPart(m[2]) };
}

/**
 * @param {string} label
 * @returns {{ label: string, startYear?: number, endYear?: number, dynastyEn?: string } | undefined}
 */
export function resolveDynastyRange(label) {
  if (!label) return undefined;
  const key = normalizeDynastyLabel(label).replace(/[朝代]$/u, '');
  const hit = STATIC_DYNASTY_ALIASES[key] ?? STATIC_DYNASTY_ALIASES[label];
  if (!hit) return undefined;
  return { label: key, ...hit };
}

/**
 * @param {string | undefined | null} a
 * @param {string | undefined | null} b
 */
export function dynastiesCompatible(a, b) {
  const left = keyPart(a);
  const right = keyPart(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const la = left.replace(/[朝代]$/u, '');
  const lb = right.replace(/[朝代]$/u, '');
  if (la === lb) return true;
  if (la.includes(lb) || lb.includes(la)) return true;
  const ra = resolveDynastyRange(left);
  const rb = resolveDynastyRange(right);
  if (!ra || !rb) return false;
  if (ra.startYear === rb.startYear && ra.endYear === rb.endYear) return true;
  return ra.startYear <= rb.endYear && rb.startYear <= ra.endYear;
}

/**
 * @param {string[]} labels
 * @param {string | undefined | null} candidate
 */
export function anyDynastyCompatible(labels, candidate) {
  if (!candidate) return false;
  return labels.some((label) => dynastiesCompatible(label, candidate));
}

/**
 * Expand a dynasty label into lookup keys (strip 朝/代; 西漢→漢 style).
 * @param {string} label
 * @returns {string[]}
 */
export function dynastyLookupKeys(label) {
  const raw = keyPart(label);
  if (!raw) return [];
  /** @type {Set<string>} */
  const keys = new Set([raw]);
  const stripped = raw.replace(/[朝代]$/u, '');
  if (stripped) keys.add(stripped);
  // 西漢/東漢/北魏 → 漢/漢/魏 (directional or regional prefixes).
  const deprefixed = stripped.replace(/^[東西南北前后前]/u, '');
  if (deprefixed) keys.add(deprefixed);
  return [...keys];
}

/**
 * Index/lookup keys for posthumous names (高皇帝 → also 高).
 * @param {string} name
 * @returns {string[]}
 */
export function posthumousLookupKeys(name) {
  const raw = keyPart(name);
  if (!raw) return [];
  /** @type {Set<string>} */
  const keys = new Set([raw]);
  for (const suffix of ['皇后', '皇帝', '太后', '天后', '帝', '后']) {
    if (raw.endsWith(suffix) && raw.length > suffix.length) {
      keys.add(raw.slice(0, -suffix.length));
    }
  }
  return [...keys];
}

/**
 * Pre-Tang target filter (settled: predates Tang; 隋 included, 唐 excluded).
 * @param {{ metadata?: Record<string, any> }} person
 */
export function isPreTangPerson(person) {
  const md = person.metadata ?? {};
  for (const label of dynastyLabelsOf(person)) {
    const range = resolveDynastyRange(label);
    if (!range) continue;
    if (range.startYear >= TANG_START_YEAR) continue; // 唐 and later
    if (range.endYear < TANG_START_YEAR) return true;
    // Dynasty ends at Tang's start year (隋 581–618).
    if (range.endYear === TANG_START_YEAR) return true;
  }
  for (const entry of md.dynasties ?? []) {
    if (entry?.startYear != null && Number(entry.startYear) >= TANG_START_YEAR) continue;
    if (entry?.endYear != null && Number(entry.endYear) <= TANG_START_YEAR) return true;
  }
  if (md.endYear != null && Number(md.endYear) < TANG_START_YEAR) return true;
  return false;
}

/**
 * @param {{ metadata?: Record<string, any> }} person
 * @returns {string[]}
 */
export function dynastyLabelsOf(person) {
  const md = person.metadata ?? {};
  /** @type {string[]} */
  const out = [];
  const add = (value) => {
    const label = keyPart(value);
    if (label && !out.includes(label)) out.push(label);
  };
  for (const entry of md.dynasties ?? []) {
    if (typeof entry === 'string') add(entry);
    else if (entry?.label) add(entry.label);
  }
  add(md.dynasty);
  for (const nat of md.nationality ?? []) {
    if (typeof nat === 'string') add(nat);
    else if (nat?.label) add(nat.label);
  }
  return out;
}

/**
 * @param {{ names?: { text?: string, type?: string }[] }} person
 * @param {Set<string>} types
 */
export function namesOfTypes(person, types) {
  return [...new Set(
    (person.names ?? [])
      .filter((n) => types.has(n.type ?? ''))
      .map((n) => keyPart(n.text))
      .filter(Boolean),
  )];
}

/**
 * True if two normalized style names denote the same courtesy name.
 * @param {string} a
 * @param {string} b
 */
export function stylesMatch(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= MIN_STYLE_LEN && b.endsWith(a)) return true;
  if (b.length >= MIN_STYLE_LEN && a.endsWith(b)) return true;
  return false;
}

/**
 * @param {string} name
 * @param {string[]} surnamesLongestFirst
 * @returns {{ family: string, given: string } | null}
 */
export function splitFamilyGiven(name, surnamesLongestFirst) {
  const surface = keyPart(name);
  if (!surface) return null;
  for (const surname of surnamesLongestFirst) {
    const family = keyPart(surname);
    if (!family || family.length >= surface.length) continue;
    if (surface.startsWith(family)) {
      const given = surface.slice(family.length);
      if (given) return { family, given };
    }
  }
  // Single-character Han surname fallback when the list misses it.
  const chars = [...surface];
  if (chars.length >= 2 && /^[\u4e00-\u9fff]/u.test(chars[0])) {
    return { family: chars[0], given: chars.slice(1).join('') };
  }
  return null;
}

/**
 * Collect personal-name surfaces for matching (not temple/posthumous alone).
 * @param {{ primaryName?: string, names?: { text?: string, type?: string }[], searchStrings?: string[] }} person
 */
export function personalNameBag(person) {
  /** @type {Set<string>} */
  const out = new Set();
  const { personal } = splitParentheticalPrimary(person.primaryName ?? '');
  if (personal) out.add(personal);
  for (const n of person.names ?? []) {
    const type = n.type ?? '';
    if (TEMPLE_TYPES.has(type) || POSTHUMOUS_TYPES.has(type)) continue;
    if (type === 'family' || type === '姓') continue;
    const text = keyPart(n.text);
    if (!text) continue;
    if (type === 'primary' || type === 'given' || type === '名' || type === 'variant') {
      const split = splitParentheticalPrimary(text);
      if (split.personal) out.add(split.personal);
    }
  }
  const family = namesOfTypes(person, FAMILY_TYPES)[0];
  const given = namesOfTypes(person, GIVEN_TYPES)[0];
  if (family && given) out.add(`${family}${given}`);
  return [...out];
}

/**
 * @param {{ primaryName?: string, names?: { text?: string, type?: string }[], searchStrings?: string[], metadata?: Record<string, any> }} person
 */
export function templeNameBag(person) {
  /** @type {Set<string>} */
  const out = new Set();
  for (const t of namesOfTypes(person, TEMPLE_TYPES)) out.add(t);
  const { paren } = splitParentheticalPrimary(person.primaryName ?? '');
  if (paren) {
    out.add(paren);
    for (const dyn of Object.keys(STATIC_DYNASTY_ALIASES)) {
      const prefix = keyPart(dyn);
      if (prefix && paren.startsWith(prefix) && paren.length > prefix.length) {
        out.add(paren.slice(prefix.length));
      }
    }
  }
  for (const title of person.metadata?.nobleTitles ?? []) {
    const temple = keyPart(title.temple ?? title.templeName);
    if (temple) out.add(temple);
  }
  return [...out];
}

/**
 * @param {{ names?: { text?: string, type?: string }[], searchStrings?: string[], metadata?: Record<string, any> }} person
 */
export function posthumousNameBag(person) {
  /** @type {Set<string>} */
  const out = new Set();
  for (const t of namesOfTypes(person, POSTHUMOUS_TYPES)) out.add(t);
  for (const title of person.metadata?.nobleTitles ?? []) {
    const pn = keyPart(title.posthumous ?? title.posthumousName);
    if (pn) out.add(pn);
    const abbr = keyPart(title.posthumousNameAbbr ?? title.posthumousAbbr);
    if (abbr) out.add(abbr);
  }
  return [...out];
}

/**
 * Attach noble titles from person-wrappers when person rows lack them.
 * @param {any[]} persons
 * @param {any[]} [wrappers]
 */
export function attachNobleTitlesFromWrappers(persons, wrappers = []) {
  if (!wrappers.length) return persons;
  /** @type {Map<string, any[]>} */
  const byPerson = new Map();
  for (const wrapper of wrappers) {
    const rawId = wrapper.metadata?.wrapper?.personId ?? wrapper.metadata?.crosswalk?.norbert;
    if (rawId == null) continue;
    const id = String(rawId).replace(/^NORBERT:person:/i, '');
    const c = wrapper.metadata?.wrapper?.components ?? {};
    const title = {
      dynasty: c.nationality ?? wrapper.metadata?.dynasty,
      fief: c.fief,
      roleName: c.roleName,
      posthumousName: c.posthumousName,
      posthumousNameAbbr: c.posthumousNameAbbr,
      temple: c.templeName,
      persName: c.persName,
    };
    if (![title.roleName, title.temple, title.posthumousName].some(Boolean)) continue;
    const list = byPerson.get(id) ?? [];
    list.push(title);
    byPerson.set(id, list);
  }
  for (const person of persons) {
    const id = String(person.authorityId).replace(/^NORBERT:person:/i, '');
    if (person.metadata?.nobleTitles?.length) continue;
    const titles = byPerson.get(id);
    if (!titles?.length) continue;
    person.metadata ??= {};
    person.metadata.nobleTitles = titles;
  }
  return persons;
}

/**
 * Resolve family name with typed preference, then surname-list split.
 * @param {{ primaryName?: string, names?: { text?: string, type?: string }[], metadata?: Record<string, any> }} person
 * @param {string[]} surnamesLongestFirst
 * @returns {{ family: string, familySource: 'typed' | 'split' } | null}
 */
export function resolveFamilyName(person, surnamesLongestFirst) {
  const typed = namesOfTypes(person, FAMILY_TYPES)[0];
  if (typed) return { family: typed, familySource: 'typed' };
  const candidates = [
    ...personalNameBag(person),
    ...((person.metadata?.nobleTitles ?? []).map((t) => keyPart(t.persName)).filter(Boolean)),
  ];
  for (const name of candidates) {
    const split = splitFamilyGiven(name, surnamesLongestFirst);
    if (split?.family) return { family: split.family, familySource: 'split' };
  }
  return null;
}

/**
 * @param {string[] | undefined} surnames
 */
export function prepareSurnameList(surnames) {
  return sortSurnamesLongestFirst(surnames ?? []);
}

/**
 * Normalize source map keys to lowercase.
 * @param {Record<string, any[]>} sources
 */
export function normalizeSourceMap(sources) {
  /** @type {Record<string, any[]>} */
  const out = {};
  for (const [key, people] of Object.entries(sources)) {
    const k = key.toLowerCase();
    out[k] = out[k] ? out[k].concat(people) : [...people];
  }
  return out;
}

/**
 * @param {string | number} norbertId
 * @param {string} source
 * @param {string | number} matchedId
 * @param {string} match
 * @param {Record<string, unknown>} evidence
 * @param {{ primaryName?: string, metadata?: Record<string, any> }} norbertPerson
 * @param {{ primaryName?: string }} matchedPerson
 */
export function concordanceRow(norbertId, source, matchedId, match, evidence, norbertPerson, matchedPerson) {
  return {
    source: 'Norbert-concordance',
    authorityId: `Norbert:${norbertId}:${source}:${matchedId}`,
    kind: 'person',
    primaryName: norbertPerson.primaryName,
    searchStrings: [norbertPerson.primaryName].filter(Boolean),
    metadata: {
      match,
      ...evidence,
      norbert: { authorityId: String(norbertId), primaryName: norbertPerson.primaryName },
      matched: {
        source,
        authorityId: String(matchedId),
        primaryName: matchedPerson.primaryName,
      },
    },
  };
}

/**
 * Bare Norbert person id from pack authorityId.
 * @param {string | number} authorityId
 */
export function barePersonId(authorityId) {
  return String(authorityId).replace(/^NORBERT:person:/i, '');
}

/**
 * @param {string | number} personId
 */
export function formatPersonId(personId) {
  return formatNorbertAuthorityValue('person', personId);
}
