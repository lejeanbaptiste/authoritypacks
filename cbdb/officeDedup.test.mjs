import test from 'node:test';
import assert from 'node:assert/strict';
import { collapseCbdbOfficeDuplicates } from './officeDedup.mjs';

function office(id, name, note, translation, typeIds, sourceDynasty = '漢前') {
  return {
    authorityId: String(id),
    primaryName: name,
    metadata: {
      sourceDynasty,
      note,
      translation,
      officeTypeIds: typeIds,
    },
  };
}

test('collapseCbdbOfficeDuplicates — keeps lowest id, records concordance', () => {
  const a = office(802448, '褚師', '掌師徒', 'Master of Instruction', ['cbdb:office-type:0102']);
  const b = office(802415, '褚師', '掌師徒', 'Master of Instruction', ['cbdb:office-type:0102']);
  const c = office(802690, '褚師', '掌師徒', 'Master of Instruction', ['cbdb:office-type:0102']);
  const other = office(999, '司里', 'different', 'x', ['cbdb:office-type:0102']);

  const { offices, concordance } = collapseCbdbOfficeDuplicates([a, b, c, other]);

  assert.equal(offices.length, 2);
  assert.equal(offices.find((o) => o.primaryName === '褚師')?.authorityId, '802415');
  assert.deepEqual(concordance, [
    { canonicalId: '802415', mergedFromId: '802448' },
    { canonicalId: '802415', mergedFromId: '802690' },
  ]);
});

test('collapseCbdbOfficeDuplicates — does not merge differing notes or types', () => {
  const a = office(1, '行人', '掌外事', 'Envoy', ['cbdb:office-type:0102']);
  const b = office(2, '行人', '掌出使', 'Envoy', ['cbdb:office-type:0102']);
  const c = office(3, '行人', '掌外事', 'Envoy', ['cbdb:office-type:0103']);

  const { offices, concordance } = collapseCbdbOfficeDuplicates([a, b, c]);

  assert.equal(offices.length, 3);
  assert.equal(concordance.length, 0);
});

test('collapseCbdbOfficeDuplicates — ignores later-dynasty rows with empty notes', () => {
  const songA = office(300224, '直長', undefined, undefined, [], '宋');
  const songB = office(300225, '直長', undefined, undefined, [], '宋');

  const { offices, concordance } = collapseCbdbOfficeDuplicates([songA, songB]);

  assert.equal(offices.length, 2);
  assert.equal(concordance.length, 0);
});
