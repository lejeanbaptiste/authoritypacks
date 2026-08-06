import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileApprovedIncludeRows,
  compileInsidersIncludeRows,
} from '../scripts/compile-huckbot5000-include.mjs';

const row = (overrides) => ({
  status: 'accepted',
  collisionFlag: 'none',
  collisionDetail: '',
  zh: '侍中',
  dynasty: '唐',
  officeIds: 'cbdb:office:1',
  candidateGloss: 'Palace Attendant',
  model: 'gpt-4o',
  ...overrides,
});

test('compileApprovedIncludeRows keeps same headword under different dynasties', () => {
  const { rules } = compileApprovedIncludeRows([
    row({ dynasty: '唐', candidateGloss: 'Palace Attendant (Tang)' }),
    row({ dynasty: '宋', candidateGloss: 'Palace Attendant (Song)' }),
  ]);
  assert.equal(rules.length, 2);
  assert.deepEqual(
    new Set(rules.map((r) => r.dynasty)),
    new Set(['唐', '宋']),
  );
});

test('compileApprovedIncludeRows still dedupes exact (zh, dynasty) pairs', () => {
  const { rules } = compileApprovedIncludeRows([
    row({ dynasty: '唐', candidateGloss: 'first' }),
    row({ dynasty: '唐', candidateGloss: 'second' }),
  ]);
  assert.equal(rules.length, 1);
  assert.equal(rules[0].gloss, 'first');
});

test('compileApprovedIncludeRows hard-gates collision flags', () => {
  const { rules, rejectedByGate } = compileApprovedIncludeRows([
    row({ collisionFlag: 'exact', candidateGloss: 'Chamberlain for Attendants' }),
  ]);
  assert.equal(rules.length, 0);
  assert.equal(rejectedByGate.length, 1);
});

test('compileInsidersIncludeRows takes collisions without requiring accepted', () => {
  const { rules } = compileInsidersIncludeRows([
    row({
      status: 'rejected',
      collisionFlag: 'exact',
      collisionDetail: 'matches Hucker verbatim',
      candidateGloss: 'Chamberlain for Attendants',
    }),
    row({
      status: 'review',
      zh: '枝江令',
      collisionFlag: 'none',
      candidateGloss: 'District Magistrate of Zhijiang',
    }),
  ]);
  assert.equal(rules.length, 1);
  assert.equal(rules[0].zh, '侍中');
  assert.equal(rules[0].collisionFlag, 'exact');
  assert.equal(rules[0].gloss, 'Chamberlain for Attendants');
});

test('compileInsidersIncludeRows dedupes by zh and dynasty', () => {
  const { rules } = compileInsidersIncludeRows([
    row({ dynasty: '唐', collisionFlag: 'exact', candidateGloss: 'first' }),
    row({ dynasty: '唐', collisionFlag: 'near-verbatim', candidateGloss: 'second' }),
    row({ dynasty: '宋', collisionFlag: 'exact', candidateGloss: 'song' }),
  ]);
  assert.equal(rules.length, 2);
  assert.equal(rules.find((r) => r.dynasty === '唐').gloss, 'first');
  assert.equal(rules.find((r) => r.dynasty === '宋').gloss, 'song');
});

test('approved and insiders split cleanly', () => {
  const rows = [
    row({ status: 'accepted', collisionFlag: 'none', candidateGloss: 'clean' }),
    row({
      status: 'rejected',
      zh: '博士',
      collisionFlag: 'exact',
      candidateGloss: 'Erudite',
    }),
  ];
  const approved = compileApprovedIncludeRows(rows);
  const insiders = compileInsidersIncludeRows(rows);
  assert.equal(approved.rules.length, 1);
  assert.equal(approved.rules[0].gloss, 'clean');
  assert.equal(insiders.rules.length, 1);
  assert.equal(insiders.rules[0].zh, '博士');
});
