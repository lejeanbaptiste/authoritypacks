import test from 'node:test';
import assert from 'node:assert/strict';
import {
  concordanceTripleKey,
  linkRowToConcordance,
  mergeReviewLinks,
  parseCsv,
  parseDynastiesCell,
} from './mergeReviewCsv.mjs';

test('parseCsv handles quoted commas and action column', () => {
  const rows = parseCsv(
    'norbert_id,norbert_name,candidate_source,candidate_id,candidate_name,tier,match_rule,reason,score,shared,dynasties,style,family,temple,posthumous,family_source,action\n' +
      '1,丁固,cbdb,20614,丁固,2,tier2-scored-review,review-only,55,"丁固;dynasty:三國吳",三國吳,,,,,,link\n' +
      '2,某人,cbdb,9,某人,2,tier2-scored-review,review-only,55,某人,唐,,,,,,ignore\n',
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].action, 'link');
  assert.equal(rows[0].shared, '丁固;dynasty:三國吳');
  assert.equal(rows[1].action, 'ignore');
});

test('parseDynastiesCell splits pipe-separated labels', () => {
  assert.deepEqual(parseDynastiesCell('東晉|前秦'), ['東晉', '前秦']);
  assert.deepEqual(parseDynastiesCell('唐'), ['唐']);
  assert.deepEqual(parseDynastiesCell(''), []);
});

test('linkRowToConcordance builds Norbert:id:source:id rows', () => {
  const row = linkRowToConcordance({
    norbert_id: '1736',
    norbert_name: '丁固',
    candidate_source: 'cbdb',
    candidate_id: '20614',
    candidate_name: '丁固',
    tier: '2',
    match_rule: 'tier2-scored-review',
    score: '55',
    shared: '丁固;dynasty:三國吳',
    dynasties: '三國吳',
    action: 'link',
  });
  assert.equal(row.authorityId, 'Norbert:1736:cbdb:20614');
  assert.equal(row.metadata.tier, '2');
  assert.equal(row.metadata.match, 'tier2-scored-review');
  assert.equal(row.metadata.reason, 'reviewed-link');
  assert.deepEqual(row.metadata.dynasties, ['三國吳']);
  assert.equal(row.metadata.norbert.authorityId, '1736');
  assert.equal(row.metadata.matched.authorityId, '20614');
});

test('mergeReviewLinks appends only new link triples', () => {
  const existing = [
    linkRowToConcordance({
      norbert_id: '1',
      norbert_name: '甲',
      candidate_source: 'cbdb',
      candidate_id: '10',
      candidate_name: '甲',
      tier: '1A',
      match_rule: 'tier1a-primary+style+dynasty',
      dynasties: '唐',
      action: 'link',
    }),
  ];
  const csv = parseCsv(
    'norbert_id,norbert_name,candidate_source,candidate_id,candidate_name,tier,match_rule,reason,score,shared,dynasties,style,family,temple,posthumous,family_source,action\n' +
      '1,甲,cbdb,10,甲,2,tier2-scored-review,review-only,55,甲,唐,,,,,,link\n' +
      '2,乙,dila,A1,乙,2,tier2-scored-review,review-only,55,乙,唐,,,,,,link\n' +
      '3,丙,cbdb,99,丙,2,tier2-scored-review,review-only,55,丙,唐,,,,,,ignore\n',
  );
  const result = mergeReviewLinks(existing, csv);
  assert.equal(result.stats.added, 1);
  assert.equal(result.stats.skippedDup, 1);
  assert.equal(result.merged.length, 2);
  assert.equal(concordanceTripleKey(result.added[0]), '2\tdila\tA1');
});
