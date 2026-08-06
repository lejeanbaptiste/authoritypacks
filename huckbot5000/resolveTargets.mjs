/**
 * Resolve Huckbot5000 generation targets from CBDB and Norbert office packs,
 * period-aware and concordance-aware. One target = one `(headword, dynasty)`
 * gloss to generate, keyed for resume and audit.
 *
 * CBDB untranslated rows are grouped by `(primaryName, metadata.dynasty)`.
 * Norbert offices linked to CBDB via office-concordance are not duplicated;
 * Norbert-only offices (no concordance link) are added as separate targets.
 *
 * When a Hucker index is provided, targets whose headword+dynasty are already
 * covered by Hucker's own period span are dropped (reuse/skip, not generate).
 */
import fs from 'node:fs';
import { readNdjson } from '../shared/ndjson.mjs';
import { buildOfficeConcordance } from '../norbert/officeConcordance.mjs';
import { huckerCoversPeriod } from '../norbert/huckerOfficeContinuity.mjs';

const normalized = (value) => String(value ?? '').normalize('NFKC').trim();

/** Stable resume/audit key for one generation unit. */
export function targetKey(zh, dynasty) {
  return `${normalized(zh)}\t${dynasty ?? ''}`;
}

function officeEntityId(source, authorityId) {
  const prefix = String(source).toLowerCase();
  return `${prefix}:office:${authorityId}`;
}

function addTarget(targets, { zh, dynasty, startYear, endYear, id, source }) {
  const key = targetKey(zh, dynasty);
  if (!targets.has(key)) {
    targets.set(key, {
      key,
      zh: normalized(zh),
      dynasty: dynasty ?? null,
      startYear: startYear ?? null,
      endYear: endYear ?? null,
      ids: [],
      sources: new Set(),
    });
  }
  const row = targets.get(key);
  if (id && !row.ids.includes(id)) row.ids.push(id);
  row.sources.add(source);
  if (startYear != null && row.startYear == null) row.startYear = startYear;
  if (endYear != null && row.endYear == null) row.endYear = endYear;
}

function loadConcordance(concordancePath, norbertOffices, cbdbOffices) {
  if (concordancePath && fs.existsSync(concordancePath)) {
    return readNdjson(concordancePath);
  }
  return buildOfficeConcordance(norbertOffices, cbdbOffices);
}

/**
 * Drop targets Hucker already covers for that dynasty (OCR corpus, period-aware)
 * or whose headword appears in CBDB's `(Hucker)`-tagged OFFICE_CODES (no period
 * metadata there — skip the headword entirely). Does not copy or ship Hucker's
 * gloss — generation is simply skipped.
 *
 * @param {Array} targets
 * @param {Map<string, Array> | null | undefined} huckerByZh
 * @param {Set<string> | null | undefined} cbdbHuckerHeadwords
 */
export function excludeHuckerCoveredTargets(targets, huckerByZh, cbdbHuckerHeadwords = null) {
  if (!huckerByZh && !cbdbHuckerHeadwords?.size) {
    return {
      targets,
      skipped: [],
      stats: { skippedHuckerCovered: 0, skippedHuckerPeriod: 0, skippedCbdbHuckerHeadword: 0 },
    };
  }
  /** @type {Array} */
  const kept = [];
  /** @type {Array} */
  const skipped = [];
  let skippedHuckerPeriod = 0;
  let skippedCbdbHuckerHeadword = 0;
  for (const target of targets) {
    if (cbdbHuckerHeadwords?.has(target.zh)) {
      skippedCbdbHuckerHeadword += 1;
      skipped.push({
        ...target,
        huckerSkip: { covered: true, reason: 'cbdb-hucker-headword' },
      });
      continue;
    }
    if (huckerByZh) {
      const verdict = huckerCoversPeriod(target.zh, target.dynasty, huckerByZh);
      if (verdict.covered) {
        skippedHuckerPeriod += 1;
        skipped.push({ ...target, huckerSkip: verdict });
        continue;
      }
    }
    kept.push(target);
  }
  return {
    targets: kept,
    skipped,
    stats: {
      skippedHuckerCovered: skipped.length,
      skippedHuckerPeriod,
      skippedCbdbHuckerHeadword,
    },
  };
}

/**
 * @param {Array} cbdbOffices
 * @param {Array} norbertOffices
 * @param {Array} concordance
 * @param {{ huckerByZh?: Map<string, Array>, cbdbHuckerHeadwords?: Set<string> }} [options]
 */
export function buildTargetsFromRecords(cbdbOffices, norbertOffices, concordance = [], options = {}) {
  const norbertLinkedToCbdb = new Set(concordance.map((row) => String(row.norbertId)));

  /** @type {Map<string, object>} */
  const targets = new Map();
  let cbdbRows = 0;
  let norbertOnly = 0;
  let norbertSkippedConcordance = 0;

  for (const row of cbdbOffices) {
    if (row.metadata?.translation) continue;
    const zh = normalized(row.primaryName);
    if (!zh) continue;
    cbdbRows += 1;
    addTarget(targets, {
      zh,
      dynasty: row.metadata?.dynasty ?? null,
      startYear: row.metadata?.startYear,
      endYear: row.metadata?.endYear,
      id: row.metadata?.entityId ?? officeEntityId('cbdb', row.authorityId),
      source: 'cbdb',
    });
  }

  for (const office of norbertOffices) {
    const norbertId = String(office.authorityId);
    if (norbertLinkedToCbdb.has(norbertId)) {
      norbertSkippedConcordance += 1;
      continue;
    }
    const zh = normalized(office.primaryName);
    if (!zh) continue;

    const attested = office.metadata?.dynastiesAttested;
    if (Array.isArray(attested) && attested.length > 0) {
      for (const span of attested) {
        norbertOnly += 1;
        addTarget(targets, {
          zh,
          dynasty: span.dynasty ?? null,
          startYear: span.startYear,
          endYear: span.endYear,
          id: office.metadata?.entityId ?? officeEntityId('norbert', office.authorityId),
          source: 'norbert',
        });
      }
      continue;
    }

    // Only dated Norbert offices are generation targets — undated rows stay
    // unknown rather than flooding the queue with dynasty-unspecified prompts.
    const hasDerivedDates =
      office.metadata?.dateSource === 'derived-from-appointments'
      && (office.metadata?.dynasty || office.metadata?.startYear != null);
    if (!hasDerivedDates) continue;

    norbertOnly += 1;
    addTarget(targets, {
      zh,
      dynasty: office.metadata?.dynasty ?? null,
      startYear: office.metadata?.startYear,
      endYear: office.metadata?.endYear,
      id: office.metadata?.entityId ?? officeEntityId('norbert', office.authorityId),
      source: 'norbert',
    });
  }

  let list = [...targets.values()].map((t) => ({
    ...t,
    sources: [...t.sources],
  }));

  const huckerFilter = excludeHuckerCoveredTargets(
    list,
    options.huckerByZh ?? null,
    options.cbdbHuckerHeadwords ?? null,
  );
  list = huckerFilter.targets;

  return {
    targets: list,
    skippedHuckerCovered: huckerFilter.skipped,
    stats: {
      cbdbUntranslatedRows: cbdbRows,
      cbdbTargetGroups: list.filter((t) => t.sources.includes('cbdb')).length,
      norbertOnlyTargets: list.filter((t) => t.sources.includes('norbert') && !t.sources.includes('cbdb')).length,
      norbertSkippedViaConcordance: norbertSkippedConcordance,
      concordanceLinks: concordance.length,
      skippedHuckerCovered: huckerFilter.stats.skippedHuckerCovered,
      skippedHuckerPeriod: huckerFilter.stats.skippedHuckerPeriod,
      skippedCbdbHuckerHeadword: huckerFilter.stats.skippedCbdbHuckerHeadword,
      totalTargets: list.length,
    },
  };
}

/**
 * @param {object} options
 * @param {string} [options.cbdbPath]
 * @param {string} [options.norbertPath]
 * @param {string} [options.concordancePath]
 * @param {Map<string, Array>} [options.huckerByZh]
 * @param {Set<string>} [options.cbdbHuckerHeadwords]
 * @returns {{ targets: Array, stats: object, skippedHuckerCovered?: Array }}
 */
export function resolveGenerationTargets(options = {}) {
  const root = options.root ?? '.';
  const cbdbPath = options.cbdbPath ?? `${root}/packs/cbdb/offices.ndjson`;
  const norbertPath = options.norbertPath ?? `${root}/packs/norbert/offices.ndjson`;
  const concordancePath = options.concordancePath ?? `${root}/packs/norbert/office-concordance.ndjson`;

  const cbdbOffices = readNdjson(cbdbPath);
  const norbertOffices = fs.existsSync(norbertPath) ? readNdjson(norbertPath) : [];
  const concordance = norbertOffices.length
    ? loadConcordance(concordancePath, norbertOffices, cbdbOffices)
    : [];

  return buildTargetsFromRecords(cbdbOffices, norbertOffices, concordance, {
    huckerByZh: options.huckerByZh,
    cbdbHuckerHeadwords: options.cbdbHuckerHeadwords,
  });
}
