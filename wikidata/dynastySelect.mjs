/**
 * Resolve dynasty id lists from CLI flags (--dynasty, --dynasties, --priority).
 */
import fs from 'node:fs';
import { preMingMembershipSpec } from './periodMembership.mjs';

/** @param {import('./dynasties.json').dynasties} dynasties */
export function dynastiesByPriority(dynasties, priority) {
  return dynasties.filter((d) => d.priority === priority);
}

/**
 * @param {typeof import('./dynasties.json').dynasties} dynasties
 * @param {{ dynastyId?: string, dynastyIds?: string[], priority?: number }} opts
 */
export function resolveDynastySelection(dynasties, opts) {
  /** @type {typeof dynasties} */
  let selected;

  if (opts.priority != null) {
    selected = dynastiesByPriority(dynasties, opts.priority);
    if (selected.length === 0) {
      throw new Error(`No dynasties with priority=${opts.priority} in dynasties.json`);
    }
  } else if (opts.dynastyIds?.length) {
    selected = opts.dynastyIds.map((id) => {
      const d = dynasties.find((x) => x.id === id);
      if (!d) throw new Error(`Unknown dynasty "${id}" — see wikidata/dynasties.json`);
      return d;
    });
  } else if (opts.dynastyId) {
    const d = dynasties.find((x) => x.id === opts.dynastyId);
    if (!d) throw new Error(`Unknown dynasty "${opts.dynastyId}" — see wikidata/dynasties.json`);
    selected = [d];
  } else {
    throw new Error('Specify --dynasty, --dynasties, or --priority');
  }

  const ids = selected.map((d) => d.id);
  const qids = selected.map((d) => d.qid);
  const slug =
    opts.priority != null
      ? `priority${opts.priority}`
      : ids.length === 1
        ? ids[0]
        : ids.join('+');

  return { dynasties: selected, ids, qids, slug };
}

/**
 * @param {typeof import('./countries.json').countries} countries
 * @param {{ countryId: string }} opts
 */
export function resolveCountrySelection(countries, opts) {
  const country = countries.find((c) => c.id === opts.countryId);
  if (!country) {
    throw new Error(`Unknown country "${opts.countryId}" — see wikidata/countries.json`);
  }
  return {
    membership: 'country-p27',
    countries: [country],
    ids: [country.id],
    qids: [country.qid],
    slug: country.packSlug ?? country.id,
    preMingSpec: null,
  };
}

/**
 * @param {typeof import('./dynasties.json').dynasties} dynasties
 * @param {{
 *   dynastyId?: string;
 *   dynastyIds?: string[];
 *   priority?: number;
 *   membership?: 'dynasty-p27' | 'pre-ming' | 'country-p27' | 'label-only';
 *   countryId?: string;
 *   countries?: typeof import('./countries.json').countries;
 * }} opts
 */
export function resolveExtractSelection(dynasties, opts) {
  if (opts.membership === 'label-only') {
    return {
      membership: 'label-only',
      dynasties: [],
      ids: ['label-only'],
      qids: [],
      slug: 'label-only',
      preMingSpec: null,
    };
  }

  if (opts.membership === 'pre-ming') {
    const preMingSpec = preMingMembershipSpec(dynasties);
    return {
      membership: 'pre-ming',
      dynasties: preMingSpec.preMingDynasties,
      ids: ['pre-ming'],
      qids: preMingSpec.preMingDynastyQids,
      slug: 'pre-ming',
      preMingSpec,
    };
  }

  if (opts.membership === 'country-p27') {
    if (!opts.countries?.length) throw new Error('country-p27 membership requires countries.json');
    if (!opts.countryId) throw new Error('Specify --country (e.g. japan) with --membership country');
    return resolveCountrySelection(opts.countries, { countryId: opts.countryId });
  }

  const selection = resolveDynastySelection(dynasties, opts);
  return {
    membership: 'dynasty-p27',
    preMingSpec: null,
    ...selection,
  };
}

/** @param {string} filePath */
export function countNdjsonLines(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return 0;
  const text = fs.readFileSync(filePath, 'utf8');
  if (!text.trim()) return 0;
  return text.split('\n').filter((l) => l.trim()).length;
}
