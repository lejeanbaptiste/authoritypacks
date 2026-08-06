import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveOfficeDates } from './deriveOfficeDates.mjs';

const person = (id, dynasty, startYear, endYear) => ({
  authorityId: id,
  metadata: dynasty ? { nationality: [{ label: dynasty, startYear, endYear }] } : {},
});

/** A person whose nationality[0] has no dates but a later entry does -- the real shape seen in Norbert's data. */
const personDatedSecond = (id, undatedLabel, datedLabel, startYear, endYear) => ({
  authorityId: id,
  metadata: {
    nationality: [
      { label: undatedLabel },
      { label: datedLabel, startYear, endYear },
    ],
  },
});

const office = (id, primaryName) => ({ authorityId: id, primaryName, metadata: {} });

const appt = (officeId, personId) => ({
  office: { authorityId: officeId },
  person: { authorityId: personId },
});

test('office with one attested dynasty gets a clean single date range', () => {
  const offices = [office('o1', '國相')];
  const persons = [person('p1', '東漢', 25, 220), person('p2', '東漢', 25, 220)];
  const appointments = [appt('o1', 'p1'), appt('o1', 'p2')];

  const { offices: out, stats } = deriveOfficeDates(offices, persons, appointments);
  assert.equal(out[0].metadata.dynasty, '東漢');
  assert.equal(out[0].metadata.startYear, 25);
  assert.equal(out[0].metadata.endYear, 220);
  assert.equal(out[0].metadata.dateEvidenceCount, 2);
  assert.equal(out[0].metadata.dateSource, 'derived-from-appointments');
  assert.equal(out[0].metadata.dynastiesAttested, undefined);
  assert.equal(stats.singleDynasty, 1);
  assert.equal(stats.multiDynasty, 0);
});

test('office attested across multiple dynasties gets a min/max span, not a fabricated label', () => {
  const offices = [office('o1', '侍中')];
  const persons = [
    person('p1', '東漢', 25, 220),
    person('p2', '北宋', 960, 1127),
    person('p3', '晉', 265, 420),
  ];
  const appointments = [appt('o1', 'p1'), appt('o1', 'p2'), appt('o1', 'p3')];

  const { offices: out, stats } = deriveOfficeDates(offices, persons, appointments);
  assert.equal(out[0].metadata.dynasty, undefined, 'no single dynasty label should be invented');
  assert.equal(out[0].metadata.startYear, 25);
  assert.equal(out[0].metadata.endYear, 1127);
  assert.equal(out[0].metadata.dynastiesAttested.length, 3);
  const byDyn = Object.fromEntries(out[0].metadata.dynastiesAttested.map((d) => [d.dynasty, d]));
  assert.equal(byDyn['東漢'].appointmentCount, 1);
  assert.equal(byDyn['北宋'].startYear, 960);
  assert.equal(stats.singleDynasty, 0);
  assert.equal(stats.multiDynasty, 1);
});

test('repeated appointments to the same dynasty count as evidence but do not create duplicate entries', () => {
  const offices = [office('o1', '大司農')];
  const persons = [person('p1', '西漢', -206, 9), person('p2', '西漢', -206, 9), person('p3', '西漢', -206, 9)];
  const appointments = [appt('o1', 'p1'), appt('o1', 'p2'), appt('o1', 'p3')];

  const { offices: out } = deriveOfficeDates(offices, persons, appointments);
  assert.equal(out[0].metadata.dateEvidenceCount, 3);
  assert.equal(out[0].metadata.dynastiesAttested, undefined, 'single dynasty despite 3 appointments');
});

test('office with no dated appointments is left completely untouched', () => {
  const offices = [office('o1', '三公曹')];
  const persons = [person('p1', null)]; // no nationality data
  const appointments = [appt('o1', 'p1')];

  const { offices: out, stats } = deriveOfficeDates(offices, persons, appointments);
  assert.deepEqual(out[0].metadata, {});
  assert.equal(stats.officesWithEvidence, 0);
  assert.equal(stats.appointmentsSkippedNoDynasty, 1);
});

test('office with zero appointments at all is untouched and does not error', () => {
  const offices = [office('o1', '上林署')];
  const { offices: out, stats } = deriveOfficeDates(offices, [], []);
  assert.deepEqual(out[0].metadata, {});
  assert.equal(stats.officesWithEvidence, 0);
});

test('existing metadata fields on the office (e.g. isSite, core) are preserved, not clobbered', () => {
  const offices = [{ authorityId: 'o1', primaryName: '國相', metadata: { isSite: true, core: '國相' } }];
  const persons = [person('p1', '東漢', 25, 220)];
  const appointments = [appt('o1', 'p1')];

  const { offices: out } = deriveOfficeDates(offices, persons, appointments);
  assert.equal(out[0].metadata.isSite, true);
  assert.equal(out[0].metadata.core, '國相');
  assert.equal(out[0].metadata.dynasty, '東漢');
});

test('finds a dated nationality entry even when an earlier, dateless entry comes first', () => {
  // Real shape seen in Norbert data: metadata.dynasty says "隋" but
  // nationality[0] is a dateless "陳" and the dated "隋" entry is at [1].
  const offices = [office('o1', '國相')];
  const persons = [personDatedSecond('p1', '陳', '隋', 581, 618)];
  const appointments = [appt('o1', 'p1')];

  const { offices: out, stats } = deriveOfficeDates(offices, persons, appointments);
  assert.equal(out[0].metadata.dynasty, '隋');
  assert.equal(out[0].metadata.startYear, 581);
  assert.equal(stats.appointmentsUsed, 1);
});

test('appointment referencing an unknown office or person id is skipped, not an error', () => {
  const offices = [office('o1', '國相')];
  const persons = [person('p1', '東漢', 25, 220)];
  const appointments = [
    appt('o1', 'p1'),
    appt('o1', 'does-not-exist'),
    appt('does-not-exist', 'p1'),
  ];

  const { offices: out, stats } = deriveOfficeDates(offices, persons, appointments);
  assert.equal(out[0].metadata.dynasty, '東漢');
  assert.equal(stats.appointmentsUsed, 1);
});
