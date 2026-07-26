import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dynastyFile = path.resolve(here, '../wikidata/dynasties.json');
const dynasties = JSON.parse(fs.readFileSync(dynastyFile, 'utf8')).dynasties;
const byLabel = new Map();
const byQid = new Map();
for (const d of dynasties) {
  byQid.set(d.qid, d);
  for (const label of [d.labelZh, d.labelEn, ...(d.aliases ?? [])]) {
    if (label) byLabel.set(String(label).replace(/[\s朝代]+/g, ''), d);
  }
}

/** @param {string} label */
export function canonicalDynasty(label) {
  return byLabel.get(String(label).trim().replace(/[\s朝代]+/g, ''));
}

/** @param {{ source: string, id: string, label: string, qid?: string }} value */
export function nationalityAssertion(value) {
  const canonical = value.qid ? (byQid.get(value.qid) ?? { qid: value.qid }) : canonicalDynasty(value.label);
  return {
    id: `${value.source}:${value.id}`,
    canonicalId: canonical?.qid ? `wikidata:${canonical.qid}` : `${value.source}:${value.id}`,
    label: value.label,
    sourceIds: [`${value.source}:${value.id}`],
    startYear: canonical?.startYear,
    endYear: canonical?.endYear,
  };
}

/** Merge assertions by canonical identity, preserving provenance. */
export function dedupeNationality(values) {
  const merged = new Map();
  for (const value of values ?? []) {
    if (!value?.canonicalId) continue;
    const current = merged.get(value.canonicalId);
    if (!current) merged.set(value.canonicalId, { ...value, sourceIds: [...(value.sourceIds ?? [value.id])] });
    else current.sourceIds = [...new Set([...current.sourceIds, ...(value.sourceIds ?? [value.id])])];
  }
  return [...merged.values()];
}
