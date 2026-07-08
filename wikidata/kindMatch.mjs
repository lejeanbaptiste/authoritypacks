/**
 * Match Wikidata dump entities to LJB pack kinds (person / place / org / work).
 */

import { claimEntityIds, entityMatchesPersonSlice, entityHasPackLabel } from './entityParse.mjs';
import { entityInstanceMatches, kindClosureEntry } from './kindInstanceClosure.mjs';

/** @param {typeof import('./kind-queries.json').kinds} kinds */
export function kindSpec(kinds, kindId) {
  const spec = kinds[kindId];
  if (!spec) throw new Error(`Unknown kind "${kindId}" — see wikidata/kind-queries.json`);
  return spec;
}

/**
 * P31 match using kind-instance-closure.json when present (P31/P279* semantics).
 * @param {unknown} entity
 * @param {{ instanceOf: string[], excludeInstanceOf?: string[] }} spec
 * @param {'person' | 'place' | 'org' | 'work'} kindId
 */
export function entityDirectInstanceMatch(entity, spec, kindId) {
  const closure = kindClosureEntry(kindId);
  return entityInstanceMatches(entity, spec, closure);
}

/**
 * @param {unknown} entity
 * @param {'person' | 'place' | 'org' | 'work'} kindId
 * @param {typeof import('./kind-queries.json').kinds} kindsDoc
 * @param {{
 *   labelLang?: string;
 *   labelLangs?: string[];
 *   membership?: 'dynasty-p27' | 'pre-ming' | 'country-p27' | 'label-only';
 *   dynastyQids?: string[];
 *   countryQids?: string[];
 *   preMingSpec?: import('./periodMembership.mjs').preMingMembershipSpec extends (...args: never) => infer R ? R : never;
 * }} opts
 */
export function entityMatchesKind(entity, kindId, kindsDoc, opts) {
  if (entity?.type !== 'item') return false;
  const labelLangs = opts.labelLangs ?? (opts.labelLang ? [opts.labelLang] : []);
  if (!labelLangs.length || !entityHasPackLabel(entity, labelLangs)) return false;

  const spec = kindSpec(kindsDoc, kindId);
  if (!entityDirectInstanceMatch(entity, spec, kindId)) return false;

  if (kindId === 'person') {
    const p31 = claimEntityIds(entity, 'P31');
    if (!p31.includes('Q5')) return false;
    if (p31.includes('Q4167410')) return false;
    if (opts.membership === 'label-only') return true;
    const primaryLabelLang = labelLangs.find((lang) => entity?.labels?.[lang]?.value) ?? labelLangs[0];
    return entityMatchesPersonSlice(entity, {
      dynastyQids: opts.dynastyQids,
      countryQids: opts.countryQids,
      labelLang: primaryLabelLang,
      membership: opts.membership ?? 'dynasty-p27',
      preMingSpec: opts.preMingSpec,
    });
  }

  return true;
}
