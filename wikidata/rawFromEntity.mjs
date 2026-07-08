/**
 * Build raw NDJSON rows per Wikidata kind.
 */

import { claimEntityIds, labelsForPackLanguage, rawPersonFromEntity, timeClaimYear } from './entityParse.mjs';
import { crosswalkFromEntity } from './identifierClaims.mjs';

/**
 * @param {unknown} entity
 * @param {string | string[]} labelLangOrLangs
 */
function baseRawFields(entity, labelLangOrLangs) {
  const labelLangs = Array.isArray(labelLangOrLangs) ? labelLangOrLangs : [labelLangOrLangs];
  const labels = labelsForPackLanguage(entity, labelLangs);
  if (!labels) return null;

  /** @type {Record<string, unknown>} */
  const raw = {
    qid: entity.id,
    primaryLabel: labels.primaryLabel,
    aliases: labels.aliases,
    p31: claimEntityIds(entity, 'P31'),
  };

  const crosswalk = crosswalkFromEntity(entity);
  if (Object.keys(crosswalk).length) raw.crosswalk = crosswalk;

  return raw;
}

/**
 * @param {unknown} entity
 * @param {'person' | 'place' | 'org' | 'work'} kindId
 * @param {string | string[]} labelLangOrLangs
 */
export function rawEntityFromKind(entity, kindId, labelLangOrLangs) {
  const labelLangs = Array.isArray(labelLangOrLangs) ? labelLangOrLangs : [labelLangOrLangs];
  if (kindId === 'person') {
    const primary = labelLangs.find((lang) => entity?.labels?.[lang]?.value);
    return primary ? rawPersonFromEntity(entity, primary) : null;
  }

  const raw = baseRawFields(entity, labelLangs);
  if (!raw) return null;

  if (kindId === 'work') {
    raw.authorQids = claimEntityIds(entity, 'P50');
    raw.publicationYear = timeClaimYear(entity, 'P577');
  }

  if (kindId === 'place') {
    raw.chgisId = claimEntityIds(entity, 'P4711')[0];
  }

  if (kindId === 'org') {
    raw.inceptionYear = timeClaimYear(entity, 'P571');
    raw.dissolvedYear = timeClaimYear(entity, 'P576');
  }

  return raw;
}

/** @param {'person' | 'place' | 'org' | 'work'} kindId */
export function rawFileNameForKind(kindId) {
  if (kindId === 'person') return 'persons.raw.ndjson';
  if (kindId === 'place') return 'places.raw.ndjson';
  if (kindId === 'org') return 'orgs.raw.ndjson';
  if (kindId === 'work') return 'works.raw.ndjson';
  throw new Error(`Unknown kind ${kindId}`);
}

/** @param {'person' | 'place' | 'org' | 'work'} kindId */
export function compiledFileNameForKind(kindId) {
  if (kindId === 'person') return 'persons.ndjson';
  if (kindId === 'place') return 'places.ndjson';
  if (kindId === 'org') return 'orgs.ndjson';
  if (kindId === 'work') return 'works.ndjson';
  throw new Error(`Unknown kind ${kindId}`);
}
