#!/usr/bin/env node
/**
 * Derive office date ranges for Norbert's offices from the dynasties of
 * people actually attested holding them (appointments -> person ->
 * metadata.nationality), rather than guessing a blanket period. Norbert
 * offices carry zero startYear/endYear today (0/16,804); this closes part
 * of that gap with real, sourced evidence instead of an assumption.
 *
 * Why not a blanket "Han-Six Dynasties" tag: tested first, and it's wrong
 * for some offices, not just coarse -- e.g. 侍中 and 御史大夫 are attested
 * well past that window in Norbert's own appointment data (through Song and
 * Sui respectively). A single label would misrepresent those, not merely
 * lose precision on them.
 *
 * Two outcomes per office with dated evidence:
 *   - single dynasty attested  -> metadata.dynasty/startYear/endYear set
 *     directly, same shape CBDB's own offices.ndjson already uses (so
 *     officeConcordance.mjs's rangesOverlap() starts actually filtering by
 *     period for Norbert offices instead of trivially passing everything).
 *   - multiple dynasties attested -> startYear/endYear set to the full
 *     min/max span (still useful for range-overlap filtering), plus
 *     metadata.dynastiesAttested listing each one with its own range and
 *     evidence count. No single `dynasty` label is set in this case --
 *     inventing one would be exactly the kind of over-coarse tag this
 *     script exists to avoid.
 *
 * Offices with no dated appointment are left untouched -- genuinely unknown
 * stays unknown rather than getting a fabricated date.
 *
 * Rewrites packs/norbert/offices.ndjson in place. Also runs automatically at
 * the end of `compile:norbert` / `compileNorbertPack()` (before office
 * concordance in `build:packs`). For a dev checkout, `npm run
 * reconcile:norbert-offices` derives dates and applies concordance crosswalks
 * in one step.
 *
 * Manual-only order when not using reconcile:
 * Run after `compile:norbert` (which regenerates that file from the raw SQL
 * dump and would wipe derived dates without the automatic compile hook) and
 * before `concordance:offices` / `build:packs` (which benefits from the
 * added dates).
 *
 * Usage:
 *   node norbert/deriveOfficeDates.mjs [--offices FILE] [--persons FILE]
 *     [--appointments FILE] [--out FILE]
 */
import path from 'node:path';
import { readNdjson, writeNdjson } from '../shared/ndjson.mjs';

/**
 * @param {Array} offices Norbert office records (packs/norbert/offices.ndjson shape)
 * @param {Array} persons Norbert person records (packs/norbert/persons.ndjson shape)
 * @param {Array} appointments Norbert appointment records (packs/norbert/appointments.ndjson shape)
 * @returns {{ offices: Array, stats: { officesWithEvidence: number, singleDynasty: number, multiDynasty: number, appointmentsUsed: number, appointmentsSkippedNoDynasty: number } }}
 */
export function deriveOfficeDates(offices, persons, appointments) {
  const personById = new Map(persons.map((p) => [String(p.authorityId), p]));
  const officeIds = new Set(offices.map((o) => String(o.authorityId)));

  /** @type {Map<string, Map<string, { dynasty: string, startYear: number, endYear: number, count: number }>>} */
  const byOffice = new Map();
  let appointmentsUsed = 0;
  let appointmentsSkippedNoDynasty = 0;

  for (const appt of appointments) {
    const officeId = appt.office?.authorityId;
    const personId = appt.person?.authorityId;
    if (!officeId || !personId || !officeIds.has(String(officeId))) continue;
    const person = personById.get(String(personId));
    // nationality[] can hold multiple entries (a person attested under more
    // than one dynasty label), and the one with a usable startYear/endYear
    // isn't always first -- e.g. a person's array can lead with a dateless
    // label and carry the dated one second. Take the first entry that
    // actually has both.
    const nat = (person?.metadata?.nationality ?? []).find(
      (n) => n?.label && n.startYear != null && n.endYear != null,
    );
    if (!nat) {
      appointmentsSkippedNoDynasty += 1;
      continue;
    }
    appointmentsUsed += 1;
    if (!byOffice.has(officeId)) byOffice.set(officeId, new Map());
    const dynMap = byOffice.get(officeId);
    const existing = dynMap.get(nat.label);
    if (existing) {
      existing.count += 1;
    } else {
      dynMap.set(nat.label, {
        dynasty: nat.label,
        startYear: nat.startYear,
        endYear: nat.endYear,
        count: 1,
      });
    }
  }

  let singleDynasty = 0;
  let multiDynasty = 0;
  const outOffices = offices.map((office) => {
    const dynMap = byOffice.get(String(office.authorityId));
    if (!dynMap || dynMap.size === 0) return office;

    const entries = [...dynMap.values()].sort((a, b) => a.startYear - b.startYear);
    const evidenceCount = entries.reduce((sum, e) => sum + e.count, 0);
    const metadata = { ...office.metadata };

    if (entries.length === 1) {
      singleDynasty += 1;
      metadata.dynasty = entries[0].dynasty;
      metadata.startYear = entries[0].startYear;
      metadata.endYear = entries[0].endYear;
    } else {
      multiDynasty += 1;
      metadata.startYear = Math.min(...entries.map((e) => e.startYear));
      metadata.endYear = Math.max(...entries.map((e) => e.endYear));
      metadata.dynastiesAttested = entries.map((e) => ({
        dynasty: e.dynasty,
        startYear: e.startYear,
        endYear: e.endYear,
        appointmentCount: e.count,
      }));
    }
    metadata.dateEvidenceCount = evidenceCount;
    metadata.dateSource = 'derived-from-appointments';

    return { ...office, metadata };
  });

  return {
    offices: outOffices,
    stats: {
      officesWithEvidence: singleDynasty + multiDynasty,
      singleDynasty,
      multiDynasty,
      appointmentsUsed,
      appointmentsSkippedNoDynasty,
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const arg = (name, fallback) => {
    const i = process.argv.indexOf(name);
    return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
  };
  const root = path.resolve(arg('--root', '.'));
  const officesPath = arg('--offices', path.join(root, 'packs/norbert/offices.ndjson'));
  const personsPath = arg('--persons', path.join(root, 'packs/norbert/persons.ndjson'));
  const appointmentsPath = arg('--appointments', path.join(root, 'packs/norbert/appointments.ndjson'));
  const outPath = arg('--out', officesPath);

  const { offices, stats } = deriveOfficeDates(
    readNdjson(officesPath),
    readNdjson(personsPath),
    readNdjson(appointmentsPath),
  );
  writeNdjson(outPath, offices);

  console.log(`Derived office dates from ${stats.appointmentsUsed} dated appointments`
    + ` (${stats.appointmentsSkippedNoDynasty} skipped, person had no usable dynasty).`);
  console.log(`Offices updated: ${stats.officesWithEvidence}`
    + ` (${stats.singleDynasty} single-dynasty, ${stats.multiDynasty} multi-dynasty spread).`);
  console.log(`Wrote ${offices.length} offices to ${outPath}`);
}
