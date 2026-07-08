/**
 * Extract external authority identifiers from Wikidata dump entities → crosswalk keys.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @typedef {'trim' | 'digits' | 'cbdbId'} IdentifierNormalize */

/**
 * @param {unknown} entity
 * @param {string} propertyId
 * @returns {string[]}
 */
export function externalIdClaimValues(entity, propertyId) {
  const claims = entity?.claims?.[propertyId];
  if (!Array.isArray(claims)) return [];

  /** @type {string[]} */
  const values = [];
  for (const claim of claims) {
    const snak = claim?.mainsnak;
    if (snak?.snaktype !== 'value' || !snak.datavalue) continue;
    const { type, value } = snak.datavalue;
    if (type === 'string' && typeof value === 'string') {
      values.push(value);
      continue;
    }
    if (typeof value === 'string') values.push(value);
  }
  return values;
}

/**
 * @param {string} value
 * @param {IdentifierNormalize | undefined} mode
 */
export function normalizeIdentifier(value, mode) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (mode === 'cbdbId') {
    const stripped = trimmed.replace(/^0+/, '');
    return stripped || trimmed;
  }
  if (mode === 'digits') {
    const digits = trimmed.replace(/\D/g, '');
    return digits || trimmed;
  }
  return trimmed;
}

/** @returns {typeof import('./identifierProperties.json')} */
export function loadIdentifierProperties() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'identifierProperties.json'), 'utf8'));
}

/**
 * @param {unknown} entity
 * @param {ReturnType<typeof loadIdentifierProperties>} [spec]
 * @returns {Record<string, string | string[]>}
 */
export function crosswalkFromEntity(entity, spec = loadIdentifierProperties()) {
  /** @type {Record<string, string | string[]>} */
  const crosswalk = {};

  for (const prop of spec.properties) {
    const rawValues = externalIdClaimValues(entity, prop.property);
    if (!rawValues.length) continue;

    const normalized = [
      ...new Set(
        rawValues
          .map((value) => normalizeIdentifier(value, prop.normalize))
          .filter(Boolean),
      ),
    ];
    if (!normalized.length) continue;

    if (prop.cardinality === 'many') {
      const existing = crosswalk[prop.key];
      const merged = [
        ...new Set([...(Array.isArray(existing) ? existing : existing ? [existing] : []), ...normalized]),
      ];
      crosswalk[prop.key] = merged;
      continue;
    }

    if (!crosswalk[prop.key]) crosswalk[prop.key] = normalized[0];
  }

  return crosswalk;
}

/**
 * @param {{ qid?: string, crosswalk?: Record<string, string | string[]> }} raw
 * @returns {import('../shared/types.mjs').CandidateMetadata['crosswalk'] | undefined}
 */
export function compiledCrosswalkFromRaw(raw) {
  /** @type {Record<string, string | string[]>} */
  const crosswalk = { ...(raw.crosswalk ?? {}) };

  const qid = raw.qid?.replace(/^Q/, '');
  if (qid) {
    const existing = crosswalk.wikidata;
    const wikidata = [
      ...new Set([...(Array.isArray(existing) ? existing : existing ? [existing] : []), qid]),
    ];
    crosswalk.wikidata = wikidata;
  }

  return Object.keys(crosswalk).length ? crosswalk : undefined;
}
