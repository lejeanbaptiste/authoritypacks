import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTargetsFromRecords, targetKey } from './resolveTargets.mjs';

const cbdbOffice = (id, name, dynasty, translation = null) => ({
  source: 'CBDB',
  authorityId: id,
  primaryName: name,
  metadata: {
    entityId: `cbdb:office:${id}`,
    dynasty,
    translation,
  },
});

const norbertOffice = (id, name, meta = {}) => ({
  source: 'Norbert',
  authorityId: id,
  primaryName: name,
  metadata: {
    entityId: `norbert:office:${id}`,
    ...meta,
  },
});

test('targetKey separates same headword across dynasties', () => {
  assert.notEqual(targetKey('侍中', '唐'), targetKey('侍中', '宋'));
});

test('buildTargetsFromRecords groups CBDB by headword and dynasty', () => {
  const { targets } = buildTargetsFromRecords(
    [
      cbdbOffice('1', '侍中', '唐'),
      cbdbOffice('2', '侍中', '宋'),
      cbdbOffice('3', '侍中', '唐', 'Grand Attendant'),
    ],
    [],
    [],
  );
  assert.equal(targets.length, 2);
  const tang = targets.find((t) => t.dynasty === '唐');
  assert.equal(tang.ids.length, 1);
  assert.equal(tang.ids[0], 'cbdb:office:1');
});

test('buildTargetsFromRecords skips concordance-linked Norbert offices', () => {
  const datedMeta = { dynasty: '唐', dateSource: 'derived-from-appointments', startYear: 618, endYear: 907 };
  const { targets, stats } = buildTargetsFromRecords(
    [cbdbOffice('1', '侍中', '唐')],
    [
      norbertOffice('n1', '侍中', datedMeta),
      norbertOffice('n2', '里正', datedMeta),
    ],
    [{ norbertId: 'n1', cbdbId: '1', canonicalEntityId: 'cbdb:office:1' }],
  );
  assert.equal(stats.norbertSkippedViaConcordance, 1);
  assert.equal(targets.some((t) => t.zh === '里正'), true);
  assert.equal(targets.some((t) => t.zh === '侍中' && t.sources.includes('norbert')), false);
});

test('buildTargetsFromRecords expands multi-dynasty Norbert into separate targets', () => {
  const { targets } = buildTargetsFromRecords(
    [],
    [
      norbertOffice('n1', '侍中', {
        dateSource: 'derived-from-appointments',
        dynastiesAttested: [
          { dynasty: '漢', startYear: -206, endYear: 220 },
          { dynasty: '唐', startYear: 618, endYear: 907 },
        ],
      }),
    ],
    [],
  );
  assert.equal(targets.length, 2);
  assert.deepEqual(targets.map((t) => t.dynasty).sort(), ['唐', '漢']);
});

test('buildTargetsFromRecords ignores undated Norbert-only offices', () => {
  const { targets, stats } = buildTargetsFromRecords(
    [],
    [norbertOffice('n1', '里正'), norbertOffice('n2', '侍中', { dynasty: '唐', dateSource: 'derived-from-appointments', startYear: 618, endYear: 907 })],
    [],
  );
  assert.equal(stats.norbertOnlyTargets, 1);
  assert.equal(targets[0].zh, '侍中');
});

test('buildTargetsFromRecords skips targets Hucker already covers for that dynasty', () => {
  const huckerByZh = new Map([
    ['參知政事', [{ en: 'Participant in Determining Governmental Matters', dynasty: 'SUNG' }]],
  ]);
  const { targets, stats, skippedHuckerCovered } = buildTargetsFromRecords(
    [
      cbdbOffice('1', '參知政事', '宋'),
      cbdbOffice('2', '參知政事', '唐'),
      cbdbOffice('3', '枝江令', '唐'),
    ],
    [],
    [],
    { huckerByZh },
  );
  assert.equal(stats.skippedHuckerCovered, 1);
  assert.equal(stats.skippedHuckerPeriod, 1);
  assert.equal(skippedHuckerCovered[0].zh, '參知政事');
  assert.equal(skippedHuckerCovered[0].dynasty, '宋');
  assert.equal(targets.some((t) => t.zh === '參知政事' && t.dynasty === '唐'), true);
  assert.equal(targets.some((t) => t.zh === '枝江令'), true);
  assert.equal(targets.some((t) => t.zh === '參知政事' && t.dynasty === '宋'), false);
});

test('buildTargetsFromRecords skips CBDB Hucker-tagged headwords in every dynasty', () => {
  const { targets, stats } = buildTargetsFromRecords(
    [
      cbdbOffice('1', '三司都勾院', '宋'),
      cbdbOffice('2', '三司都勾院', '唐'),
      cbdbOffice('3', '枝江令', '唐'),
    ],
    [],
    [],
    { cbdbHuckerHeadwords: new Set(['三司都勾院']) },
  );
  assert.equal(stats.skippedCbdbHuckerHeadword, 2);
  assert.equal(targets.length, 1);
  assert.equal(targets[0].zh, '枝江令');
});
