/**
 * Parse Wikidata JSON dump entities (W2).
 */

import {
  personYearsOverlapPreMing,
  preMingMembershipSpec,
  rawPersonHasPreMingAuthority,
} from './periodMembership.mjs';
import { kanaReadingsFromEntity } from './kanaReadings.mjs';
import { crosswalkFromEntity } from './identifierClaims.mjs';

/** @param {unknown} entity */
export function claimEntityIds(entity, propertyId) {
  const claims = entity?.claims?.[propertyId];
  if (!Array.isArray(claims)) return [];
  /** @type {string[]} */
  const ids = [];
  for (const claim of claims) {
    const snak = claim?.mainsnak;
    if (snak?.snaktype !== 'value' || !snak.datavalue) continue;
    const { type, value } = snak.datavalue;
    if (type === 'wikibase-entityid' && value?.id) ids.push(value.id);
  }
  return ids;
}

/** @param {unknown} entity @param {string} propertyId */
export function timeClaimYear(entity, propertyId) {
  const claims = entity?.claims?.[propertyId];
  if (!Array.isArray(claims) || claims.length === 0) return undefined;
  const time = claims[0]?.mainsnak?.datavalue?.value?.time;
  if (typeof time !== 'string') return undefined;
  const m = /^([+-])(\d+)-/.exec(time);
  if (!m) return undefined;
  const year = Number.parseInt(m[2], 10);
  return m[1] === '-' ? -year : year;
}

/** @param {unknown} entity @param {string} propertyId */
export function stringClaimValue(entity, propertyId) {
  const claims = entity?.claims?.[propertyId];
  if (!Array.isArray(claims) || claims.length === 0) return undefined;
  const val = claims[0]?.mainsnak?.datavalue?.value;
  if (typeof val === 'string') return val;
  return undefined;
}

/**
 * Wikidata sitelink site for a pack/API label language.
 * Chinese variants share zhwiki (titles are often traditional).
 * @param {string} labelLang
 * @returns {string | null}
 */
export function wikipediaSiteForLabelLang(labelLang) {
  const key = String(labelLang ?? '')
    .trim()
    .toLowerCase();
  if (!key) return null;
  if (key === 'ja') return 'jawiki';
  if (key === 'ko') return 'kowiki';
  if (key === 'bo') return 'bowiki';
  if (key === 'en') return 'enwiki';
  if (key === 'zh' || key.startsWith('zh-') || key === 'lzh') return 'zhwiki';
  return null;
}

/**
 * Strip Wikipedia disambiguation suffixes: `崔諲 (十六國到劉宋)` → `崔諲`.
 * @param {string} title
 */
export function cleanWikipediaSitelinkTitle(title) {
  return String(title ?? '')
    .normalize('NFC')
    .trim()
    .replace(/_?\([^)]*\)\s*$/u, '')
    .replace(/_?（[^）]*）\s*$/u, '')
    .trim();
}

/**
 * Article title from sitelinks when Wikidata has no label in `labelLang`.
 * Many historical Chinese people only have an English label + zhwiki sitelink
 * (e.g. Q45421892 → 崔諲).
 * @param {unknown} entity
 * @param {string} labelLang
 * @returns {string | null}
 */
export function wikipediaTitleFromSitelinks(entity, labelLang) {
  const site = wikipediaSiteForLabelLang(labelLang);
  if (!site) return null;
  const rawTitle = entity?.sitelinks?.[site]?.title;
  if (typeof rawTitle !== 'string' || !rawTitle.trim()) return null;
  const cleaned = cleanWikipediaSitelinkTitle(rawTitle);
  return cleaned || null;
}

/**
 * @param {unknown} entity
 * @param {string} labelLang
 */
export function labelsForLanguage(entity, labelLang) {
  let primaryLabel = entity?.labels?.[labelLang]?.value;
  if (!primaryLabel) {
    primaryLabel = wikipediaTitleFromSitelinks(entity, labelLang) ?? undefined;
  }
  if (!primaryLabel) return null;

  /** @type {string[]} */
  const aliases = [];
  for (const entry of entity?.aliases?.[labelLang] ?? []) {
    if (entry?.value) aliases.push(entry.value);
  }

  const native = stringClaimValue(entity, 'P1705');
  if (native && native !== primaryLabel) aliases.push(native);

  // When the primary came from a sitelink, keep any real Wikidata label in another
  // Chinese variant as an alias if present.
  if (!entity?.labels?.[labelLang]?.value) {
    for (const lang of ['zh-hant', 'zh-tw', 'zh-hk', 'zh-hans', 'zh']) {
      if (lang === labelLang) continue;
      const alt = entity?.labels?.[lang]?.value;
      if (alt && alt !== primaryLabel) aliases.push(alt);
    }
  }

  return {
    primaryLabel,
    aliases: [...new Set(aliases)],
  };
}

/**
 * First matching Wikidata label language from a pack config (e.g. zh-hant then zh-tw).
 * @param {unknown} entity
 * @param {string[]} labelLangs
 */
export function labelsForPackLanguage(entity, labelLangs) {
  for (const labelLang of labelLangs) {
    const labels = labelsForLanguage(entity, labelLang);
    if (labels) return { ...labels, labelLang };
  }
  return null;
}

/** @param {unknown} entity @param {string[]} labelLangs */
export function entityHasPackLabel(entity, labelLangs) {
  return labelLangs.some(
    (lang) =>
      Boolean(entity?.labels?.[lang]?.value) || Boolean(wikipediaTitleFromSitelinks(entity, lang)),
  );
}

/**
 * @param {unknown} entity
 * @param {{
 *   dynastyQid?: string;
 *   dynastyQids?: string[];
 *   labelLang: string;
 *   requireHuman?: boolean;
 *   membership?: 'dynasty-p27' | 'pre-ming' | 'country-p27';
 *   countryQids?: string[];
 *   preMingSpec?: ReturnType<typeof preMingMembershipSpec>;
 * }} opts
 */
export function entityMatchesPersonSlice(entity, opts) {
  if (entity?.type !== 'item') return false;

  const p31 = claimEntityIds(entity, 'P31');
  if (opts.requireHuman !== false && !p31.includes('Q5')) return false;
  if (p31.includes('Q4167410')) return false;

  if (!entityHasPackLabel(entity, [opts.labelLang])) return false;

  if (opts.membership === 'country-p27') {
    const p27 = claimEntityIds(entity, 'P27');
    if (opts.countryQids?.length) {
      if (!opts.countryQids.some((qid) => p27.includes(qid))) return false;
    }
    return true;
  }

  if (opts.membership === 'pre-ming') {
    const spec = opts.preMingSpec;
    if (!spec) throw new Error('pre-ming membership requires preMingSpec');
    const p27 = claimEntityIds(entity, 'P27');
    const p2348 = claimEntityIds(entity, 'P2348');
    const birthYear = timeClaimYear(entity, 'P569');
    const deathYear = timeClaimYear(entity, 'P570');
    if (rawPersonHasPreMingAuthority({ p27, p2348 }, spec)) return true;
    return personYearsOverlapPreMing({ birthYear, deathYear }, spec.preMingEndYear);
  }

  const p27 = claimEntityIds(entity, 'P27');
  if (opts.dynastyQids?.length) {
    if (!opts.dynastyQids.some((qid) => p27.includes(qid))) return false;
  } else if (opts.dynastyQid) {
    if (!p27.includes(opts.dynastyQid)) return false;
  }

  return true;
}

/** @param {{ p27?: string[] }} raw @param {string} dynastyQid */
export function rawPersonMatchesDynasty(raw, dynastyQid) {
  return (raw.p27 ?? []).includes(dynastyQid);
}

/** @param {{ p27?: string[] }} raw @param {string} countryQid */
export function rawPersonMatchesCountry(raw, countryQid) {
  return (raw.p27 ?? []).includes(countryQid);
}

/**
 * @param {unknown} entity
 * @param {string} labelLang
 */
export function rawPersonFromEntity(entity, labelLang) {
  const labels = labelsForLanguage(entity, labelLang);
  if (!labels) return null;

  /** @type {ReturnType<typeof rawPersonFromEntity>} */
  const raw = {
    qid: entity.id,
    primaryLabel: labels.primaryLabel,
    aliases: labels.aliases,
    familyName: stringClaimValue(entity, 'P734') ?? '',
    givenName: stringClaimValue(entity, 'P735') ?? '',
    p27: claimEntityIds(entity, 'P27'),
    p2348: claimEntityIds(entity, 'P2348'),
    p31: claimEntityIds(entity, 'P31'),
    birthYear: timeClaimYear(entity, 'P569'),
    deathYear: timeClaimYear(entity, 'P570'),
  };

  const kana = kanaReadingsFromEntity(entity);
  if (kana) {
    raw.nameInKana = kana.nameInKana;
    raw.yomiHiragana = kana.yomiHiragana;
  }

  const crosswalk = crosswalkFromEntity(entity);
  if (Object.keys(crosswalk).length) raw.crosswalk = crosswalk;

  return raw;
}
