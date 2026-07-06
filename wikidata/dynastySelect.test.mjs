import test from 'node:test';
import assert from 'node:assert/strict';
import { dynastiesByPriority, resolveDynastySelection } from './dynastySelect.mjs';

const dynasties = [
  { id: 'tang', qid: 'Q9683', priority: 1 },
  { id: 'song', qid: 'Q1107', priority: 1 },
  { id: 'ming', qid: 'Q9903', priority: 1 },
  { id: 'sui', qid: 'Q9685' },
];

test('dynastiesByPriority returns priority-1 slice', () => {
  const p1 = dynastiesByPriority(dynasties, 1);
  assert.deepEqual(
    p1.map((d) => d.id),
    ['tang', 'song', 'ming'],
  );
});

test('resolveDynastySelection --priority slug', () => {
  const sel = resolveDynastySelection(dynasties, { priority: 1 });
  assert.equal(sel.slug, 'priority1');
  assert.equal(sel.qids.length, 3);
});

test('resolveDynastySelection explicit list', () => {
  const sel = resolveDynastySelection(dynasties, { dynastyIds: ['tang', 'sui'] });
  assert.equal(sel.slug, 'tang+sui');
  assert.deepEqual(sel.qids, ['Q9683', 'Q9685']);
});
