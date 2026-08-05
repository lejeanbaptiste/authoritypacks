import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makePurgeOrder,
  parsePurgeOrders,
  purgeOrdersFromConcordanceDiff,
  serializePurgeOrders,
} from './purgeOrders.mjs';

const row = (norbertId, source, matchedId, name = '某人') => ({
  primaryName: name,
  metadata: {
    norbert: { authorityId: String(norbertId), primaryName: name },
    matched: { source, authorityId: String(matchedId), primaryName: name },
  },
});

test('purgeOrdersFromConcordanceDiff emits unlink/link/replace', () => {
  const previous = [row(1, 'cbdb', '100', '甲'), row(2, 'cbdb', '200', '乙')];
  const next = [row(1, 'cbdb', '101', '甲'), row(3, 'dila', 'A1', '丙')];
  const orders = purgeOrdersFromConcordanceDiff(previous, next, {
    bundleVersion: 'test-1',
    notePrefix: '[test]',
  });
  const kinds = orders.map((o) => o.kind).sort();
  assert.deepEqual(kinds, ['concordance-link', 'concordance-replace', 'concordance-unlink']);
  assert.ok(orders.every((o) => o.from === 'developer'));
  assert.ok(orders.every((o) => o.note.includes('[test]')));
});

test('serialize/parse round-trip', () => {
  const order = makePurgeOrder({
    kind: 'pack-note',
    note: 'Hello from the developer',
    bundleVersion: '1.2.3',
  });
  const text = serializePurgeOrders([order]);
  const parsed = parsePurgeOrders(text);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].note, 'Hello from the developer');
  assert.equal(parsed[0].from, 'developer');
});
