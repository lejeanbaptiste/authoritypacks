import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveOriginGroups } from './originResolve.mjs';

const person = (source, authorityId, origin) => ({
  source,
  authorityId,
  kind: 'person',
  primaryName: authorityId,
  searchStrings: [authorityId],
  metadata: { origin: [origin] },
});

test('origin resolver classifies each origin type independently', () => {
  const groups = resolveOriginGroups({
    CBDB: [person('CBDB', '1', { originType: 'jiguan', placeName: '甲', geo: { lat: 30, lon: 120 } }),
      person('CBDB', '2', { originType: 'birthplace', placeName: '乙', geo: { lat: 40, lon: 120 } })],
    Norbert: [],
    DILA: [],
  });

  assert.deepEqual(groups.map((group) => group.decision), ['coordinate-mode', 'coordinate-mode']);
  assert.deepEqual(groups.map((group) => group.originType), ['jiguan', 'birthplace']);
});

test('origin resolver uses conflict-id-mode for distant same-type evidence', () => {
  const groups = resolveOriginGroups({
    CBDB: [
      person('CBDB', '1', { originType: 'jiguan', placeName: '甲', geo: { lat: 30, lon: 120 } }),
      person('CBDB', '1', { originType: 'jiguan', placeName: '乙', geo: { lat: 40, lon: 120 } }),
    ],
  });

  assert.equal(groups.length, 1);
  assert.equal(groups[0].decision, 'conflict-id-mode');
  assert.deepEqual(groups[0].conflictReasons, ['distance']);
});

test('origin resolver exposes place-type conflicts', () => {
  const groups = resolveOriginGroups({
    CBDB: [
      person('CBDB', '1', { originType: 'jiguan', placeName: '甲', placeType: '府', geo: { lat: 30, lon: 120 } }),
      person('CBDB', '1', { originType: 'jiguan', placeName: '乙', placeType: '縣', geo: { lat: 30.01, lon: 120.01 } }),
    ],
  });

  assert.equal(groups[0].decision, 'conflict-id-mode');
  assert.deepEqual(groups[0].conflictReasons, ['place-type']);
});

test('origin resolver marks string-only groups as missing-geo id-mode', () => {
  const groups = resolveOriginGroups({
    CBDB: [person('CBDB', '1', { originType: 'jiguan', placeName: '甲' })],
  });

  assert.equal(groups[0].decision, 'id-mode');
  assert.deepEqual(groups[0].conflictReasons, ['missing-geo']);
});

test('origin resolver links only supplied cross-source person concordances', () => {
  const groups = resolveOriginGroups({
    CBDB: [person('CBDB', '1', { originType: 'jiguan', placeName: '甲' })],
    DILA: [person('DILA', 'A', { originType: 'placeOfOrigin', placeName: '甲' })],
  }, [{ source: 'DILA', authorityId: 'A', targetSource: 'CBDB', targetAuthorityId: '1' }]);

  assert.equal(groups.length, 2);
  assert.ok(groups.every((group) => group.identityBasis === 'crosswalk'));
  assert.ok(groups.every((group) => group.people.length === 2));
});
