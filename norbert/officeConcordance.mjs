#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { readNdjson, writeNdjson } from '../shared/ndjson.mjs';
import { officeEntityId } from '../shared/officeGraph.mjs';
import {
  huckerAffirmsContinuity,
  indexHuckerOfficeEntries,
} from './huckerOfficeContinuity.mjs';

const normalized = (value) => String(value ?? '').normalize('NFKC').trim();

export function rangesOverlap(a, b) {
  const aStart = a.metadata?.startYear;
  const aEnd = a.metadata?.endYear;
  const bStart = b.metadata?.startYear;
  const bEnd = b.metadata?.endYear;
  if (aStart == null && aEnd == null) return true;
  if (bStart == null && bEnd == null) return true;
  return (aStart ?? aEnd) <= (bEnd ?? bStart) && (bStart ?? bEnd) <= (aEnd ?? aStart);
}

function norbertIsDated(office) {
  return office.metadata?.startYear != null || office.metadata?.endYear != null;
}

/**
 * Build only conservative, unambiguous office links.
 *
 * Dated Norbert offices: exact name + period overlap (including boundary-touch
 * and Tang-overlapping multi-dynasty spans) → link when exactly one CBDB match.
 *
 * Undated Norbert offices: same name match is not enough. Hucker must affirm
 * the title is one continuous office across a span covering the CBDB dynasty
 * and at least one earlier dynasty. Silent or period-distinct Hucker → no link.
 *
 * @param {Array} norbert
 * @param {Array} cbdb
 * @param {{ huckerByZh?: Map<string, Array> }} [options]
 */
export function buildOfficeConcordance(norbert, cbdb, options = {}) {
  const huckerByZh = options.huckerByZh ?? null;
  const cbdbBySurface = new Map();
  for (const office of cbdb) {
    for (const surface of office.searchStrings ?? [office.primaryName]) {
      const key = normalized(surface);
      const rows = cbdbBySurface.get(key) ?? [];
      if (!rows.includes(office)) rows.push(office);
      cbdbBySurface.set(key, rows);
    }
  }

  const out = [];
  for (const office of norbert) {
    const matches = (cbdbBySurface.get(normalized(office.primaryName)) ?? [])
      .filter((candidate) => rangesOverlap(office, candidate));
    if (matches.length !== 1) continue;
    const match = matches[0];

    let rule = 'exact-name+period-compatible';
    let huckerReason = null;
    if (!norbertIsDated(office)) {
      if (!huckerByZh) continue; // undated requires Hucker; no corpus → no link
      const verdict = huckerAffirmsContinuity(
        office.primaryName,
        match.metadata?.dynasty,
        huckerByZh,
      );
      huckerReason = verdict.reason;
      if (!verdict.ok) continue;
      rule = 'exact-name+hucker-continuous';
    }

    out.push({
      norbertId: String(office.authorityId),
      cbdbId: String(match.authorityId),
      canonicalEntityId:
        match.metadata?.canonicalEntityId ?? officeEntityId('cbdb', match.authorityId),
      evidence: {
        rule,
        surface: office.primaryName,
        norbertRange: [office.metadata?.startYear ?? null, office.metadata?.endYear ?? null],
        cbdbRange: [match.metadata?.startYear ?? null, match.metadata?.endYear ?? null],
        ...(huckerReason ? { hucker: huckerReason } : {}),
      },
    });
  }
  return out;
}

/** Strip previous CBDB crosswalks so a re-run does not leave stale links. */
export function clearOfficeCbdbCrosswalks(offices) {
  for (const office of offices) {
    if (!office.metadata) continue;
    if (office.metadata.crosswalk && 'cbdb' in office.metadata.crosswalk) {
      delete office.metadata.crosswalk.cbdb;
      if (Object.keys(office.metadata.crosswalk).length === 0) delete office.metadata.crosswalk;
    }
    if (String(office.metadata.canonicalEntityId ?? '').startsWith('cbdb:')) {
      delete office.metadata.canonicalEntityId;
    }
  }
  return offices;
}

export function integrateOfficeConcordance(concordance, offices, relations = []) {
  clearOfficeCbdbCrosswalks(offices);
  const links = new Map(
    concordance.map((row) => [String(row.norbertId), row]),
  );
  const entityRemap = new Map();
  for (const office of offices) {
    const link = links.get(String(office.authorityId));
    if (!link) continue;
    office.metadata ??= {};
    const provisional =
      office.metadata.entityId ?? officeEntityId('norbert', office.authorityId);
    office.metadata.entityId = provisional;
    office.metadata.canonicalEntityId = link.canonicalEntityId;
    office.metadata.crosswalk ??= {};
    office.metadata.crosswalk.cbdb = link.cbdbId;
    entityRemap.set(provisional, link.canonicalEntityId);
  }
  for (const office of offices) {
    const parent = office.metadata?.parentOffice;
    if (parent) parent.entityId = entityRemap.get(parent.entityId) ?? parent.entityId;
  }
  const remappedRelations = relations.map((relation) => ({
    ...relation,
    subject: entityRemap.get(relation.subject) ?? relation.subject,
    object: entityRemap.get(relation.object) ?? relation.object,
  }));
  return { offices, relations: remappedRelations, applied: entityRemap.size };
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const arg = (name, fallback) => {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] ?? fallback : fallback;
  };
  const root = path.resolve(arg('--root', '.'));
  const norbertPath = arg('--norbert', path.join(root, 'packs/norbert/offices.ndjson'));
  const cbdbPath = arg('--cbdb', path.join(root, 'packs/cbdb/offices.ndjson'));
  const huckerPath = arg('--hucker', path.join(root, 'skunkworks/scripts/out/hucker_entries.ndjson'));
  const outPath = arg(
    '--out',
    path.join(root, 'packs/norbert/office-concordance.ndjson'),
  );

  let huckerByZh = null;
  if (fs.existsSync(huckerPath)) {
    const { readHuckerPairs } = await import('../huckbot5000/lib.mjs');
    huckerByZh = indexHuckerOfficeEntries(readHuckerPairs(huckerPath));
  } else {
    console.warn(`WARNING: Hucker corpus not found at ${huckerPath}; undated Norbert offices will not be linked.`);
  }

  const concordance = buildOfficeConcordance(
    readNdjson(norbertPath),
    readNdjson(cbdbPath),
    { huckerByZh },
  );
  writeNdjson(outPath, concordance);
  console.log(`Wrote ${concordance.length} office concordance rows to ${outPath}`);
}
