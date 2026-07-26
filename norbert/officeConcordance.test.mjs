import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOfficeConcordance,
  integrateOfficeConcordance,
} from './officeConcordance.mjs';

const office = (source, authorityId, primaryName, startYear, endYear) => ({
  source,
  authorityId,
  kind: 'office',
  primaryName,
  searchStrings: [primaryName],
  metadata: {
    entityId: `${source.toLowerCase()}:office:${authorityId}`,
    startYear,
    endYear,
  },
});

test('office concordance links only one period-compatible exact match', () => {
  const norbert = [office('Norbert', 'n1', '侍中', 200, 400)];
  const cbdb = [
    office('CBDB', 'c1', '侍中', 200, 500),
    office('CBDB', 'c2', '侍中', 900, 1000),
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

test('integration keeps source id and remaps inferred relation endpoints', () => {
  const offices = [
    office('Norbert', 'n1', '尚書省', 200, 400),
    office('Norbert', 'n2', '吏部', 200, 400),
  ];
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
  assert.equal(result.offices[0].authorityId, 'n1');
  assert.equal(result.offices[0].metadata.canonicalEntityId, 'cbdb:office:c1');
  assert.equal(result.offices[0].metadata.crosswalk.cbdb, 'c1');
  assert.equal(result.relations[0].subject, 'cbdb:office:c1');
  assert.equal(result.relations[0].object, 'norbert:office:n2');
});
