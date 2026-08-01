import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNorbertConcordance,
  concordanceIdnosByNorbertId,
  uniqueConcordanceRows,
} from './concordance.mjs';

const n = (source, id, primary, style, dynasty) => ({ source, authorityId: id, primaryName: primary, names: [{ text: style, type: 'courtesy' }], metadata: { dynasty } });

test('requires primary name, style name, and dynasty', () => {
  const rows = buildNorbertConcordance([n('Norbert', '1', '王安石', '介甫', '宋')], {
    cbdb: [n('CBDB', '2', '王安石', '介甫', '宋'), n('CBDB', '3', '王安石', '介甫', '唐')],
    dila: [n('DILA', '4', '王安石', '介甫', undefined)],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].metadata.matched.source, 'cbdb');
  assert.equal(rows[0].metadata.match, 'primary+style+dynasty');
});

test('ambiguous same-source hits are dropped from unique idno map', () => {
  const rows = buildNorbertConcordance([n('Norbert', '1', '王安石', '介甫', '宋')], {
    cbdb: [
      n('CBDB', '2', '王安石', '介甫', '宋'),
      n('CBDB', '9', '王安石', '介甫', '宋'),
    ],
    wikidata: [n('Wikidata', 'Q1', '王安石', '介甫', '宋')],
  });
  assert.equal(rows.length, 3);
  assert.equal(uniqueConcordanceRows(rows).length, 1);
  const idnos = concordanceIdnosByNorbertId(rows);
  assert.deepEqual(idnos.get('1'), { wikidata: 'Q1' });
});
