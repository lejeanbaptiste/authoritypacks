import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOfficeConcordance,
  integrateOfficeConcordance,
  clearOfficeCbdbCrosswalks,
} from './officeConcordance.mjs';
import {
  expandHuckerDynastyField,
  huckerAffirmsContinuity,
  indexHuckerOfficeEntries,
  cbdbDynastyToHuckerAtom,
} from './huckerOfficeContinuity.mjs';

const office = (source, authorityId, primaryName, startYear, endYear, dynasty = null) => ({
  source,
  authorityId,
  kind: 'office',
  primaryName,
  searchStrings: [primaryName],
  metadata: {
    entityId: `${source.toLowerCase()}:office:${authorityId}`,
    startYear,
    endYear,
    dynasty,
  },
});

test('office concordance links only one period-compatible exact match', () => {
  const norbert = [office('Norbert', 'n1', '侍中', 200, 400)];
  const cbdb = [
    office('CBDB', 'c1', '侍中', 200, 500, '漢'),
    office('CBDB', 'c2', '侍中', 900, 1000, '唐'),
  ];
  cbdb[0].metadata.canonicalEntityId = 'cbdb:office:c1';
  const rows = buildOfficeConcordance(norbert, cbdb);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].cbdbId, 'c1');
});

test('office concordance leaves unresolved same-period homonyms separate', () => {
  const norbert = [office('Norbert', 'n1', '侍中', 200, 400)];
  const cbdb = [
    office('CBDB', 'c1', '侍中', 200, 500),
    office('CBDB', 'c2', '侍中', 300, 600),
  ];
  assert.deepEqual(buildOfficeConcordance(norbert, cbdb), []);
});

test('boundary-touch at 618 still links dated Norbert to Tang CBDB', () => {
  const norbert = [office('Norbert', 'n1', '上柱國', 266, 618)];
  const cbdb = [office('CBDB', 'c1', '上柱國', 618, 907, '唐')];
  const rows = buildOfficeConcordance(norbert, cbdb);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].evidence.rule, 'exact-name+period-compatible');
});

test('undated Norbert links only when Hucker affirms continuity', () => {
  const huckerByZh = indexHuckerOfficeEntries([
    { zh: '司經局', en: 'Editorial Service', dynasty: "SUI-T'ANG, LIAO, MING-CH'ING" },
    { zh: '典膳局', en: 'Foods Service', dynasty: "T'ANG" },
  ]);
  const norbert = [
    office('Norbert', 'n1', '司經局', null, null),
    office('Norbert', 'n2', '典膳局', null, null),
    office('Norbert', 'n3', '上林署', null, null),
  ];
  const cbdb = [
    office('CBDB', 'c1', '司經局', 618, 907, '唐'),
    office('CBDB', 'c2', '典膳局', 618, 907, '唐'),
    office('CBDB', 'c3', '上林署', 1115, 1234, '金'),
  ];
  const rows = buildOfficeConcordance(norbert, cbdb, { huckerByZh });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].norbertId, 'n1');
  assert.equal(rows[0].evidence.rule, 'exact-name+hucker-continuous');
});

test('undated Norbert with distinct Hucker glosses does not link', () => {
  const huckerByZh = indexHuckerOfficeEntries([
    { zh: '司農寺', en: 'Court for the National Treasury', dynasty: 'SUI' },
    { zh: '司農寺', en: 'Court of the National Granaries', dynasty: 'SUI-SUNG' },
  ]);
  const rows = buildOfficeConcordance(
    [office('Norbert', 'n1', '司農寺', null, null)],
    [office('CBDB', 'c1', '司農寺', 960, 1279, '宋')],
    { huckerByZh },
  );
  assert.deepEqual(rows, []);
});

test('expandHuckerDynastyField fills inclusive ranges', () => {
  const atoms = expandHuckerDynastyField('SUI-SUNG');
  assert.equal(atoms.has('SUI'), true);
  assert.equal(atoms.has("T'ANG"), true);
  assert.equal(atoms.has('SUNG'), true);
  assert.equal(atoms.has('HAN'), false);
});

test('huckerAffirmsContinuity reasons', () => {
  const byZh = indexHuckerOfficeEntries([
    { zh: '內直局', en: 'Palace Attendance Service', dynasty: 'SUI-SUNG' },
  ]);
  assert.equal(huckerAffirmsContinuity('內直局', '唐', byZh).ok, true);
  assert.equal(huckerAffirmsContinuity('無此官', '唐', byZh).reason, 'hucker-silent');
  assert.equal(cbdbDynastyToHuckerAtom('唐'), "T'ANG");
});

test('integration clears stale CBDB crosswalks then applies new links', () => {
  const offices = [
    office('Norbert', 'n1', '尚書省', 200, 400),
    office('Norbert', 'n2', '吏部', 200, 400),
  ];
  offices[1].metadata.canonicalEntityId = 'cbdb:office:old';
  offices[1].metadata.crosswalk = { cbdb: 'old' };
  const relation = {
    id: 'r1',
    type: 'parentOf',
    subject: 'norbert:office:n1',
    object: 'norbert:office:n2',
  };
  const result = integrateOfficeConcordance(
    [{ norbertId: 'n1', cbdbId: 'c1', canonicalEntityId: 'cbdb:office:c1' }],
    offices,
    [relation],
  );
  assert.equal(result.offices[0].metadata.canonicalEntityId, 'cbdb:office:c1');
  assert.equal(result.offices[0].metadata.crosswalk.cbdb, 'c1');
  assert.equal(result.offices[1].metadata.canonicalEntityId, undefined);
  assert.equal(result.offices[1].metadata.crosswalk?.cbdb, undefined);
  assert.equal(result.relations[0].subject, 'cbdb:office:c1');
  assert.equal(result.relations[0].object, 'norbert:office:n2');
});

test('clearOfficeCbdbCrosswalks is idempotent', () => {
  const offices = [office('Norbert', 'n1', 'X', 1, 2)];
  offices[0].metadata.canonicalEntityId = 'cbdb:office:1';
  offices[0].metadata.crosswalk = { cbdb: '1', other: 'y' };
  clearOfficeCbdbCrosswalks(offices);
  assert.equal(offices[0].metadata.crosswalk.cbdb, undefined);
  assert.equal(offices[0].metadata.crosswalk.other, 'y');
});
