import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INDEX_YEAR_WINDOW,
  biographicalYearsFromMetadata,
  hasFilterInterval,
  personDateMetadata,
} from './personDates.mjs';

test('fine dates win over floruit, index, and never invent dynasty years', () => {
  const meta = personDateMetadata({
    birthYear: 1021,
    deathYear: 1086,
    flEarliest: 1040,
    indexYear: 1050,
  });
  assert.equal(meta.dateSource, 'fine');
  assert.equal(meta.startYear, 1021);
  assert.equal(meta.endYear, 1086);
  assert.equal(meta.indexYear, 1050);
  assert.deepEqual(biographicalYearsFromMetadata(meta), { startYear: 1021, endYear: 1086 });
});

test('floruit is filter-only', () => {
  const meta = personDateMetadata({ flEarliest: 1040, flLatest: 1060 });
  assert.equal(meta.dateSource, 'floruit');
  assert.equal(meta.startYear, 1040);
  assert.equal(meta.endYear, 1060);
  assert.deepEqual(biographicalYearsFromMetadata(meta), {});
  assert.equal(hasFilterInterval(meta), true);
});

test('index year expands to ± window (CBDB mean-date model)', () => {
  const meta = personDateMetadata({ indexYear: 1065 });
  assert.equal(meta.dateSource, 'index');
  assert.equal(meta.indexYear, 1065);
  assert.equal(meta.startYear, 1065 - INDEX_YEAR_WINDOW);
  assert.equal(meta.endYear, 1065 + INDEX_YEAR_WINDOW);
  assert.deepEqual(biographicalYearsFromMetadata(meta), {});
});

test('no vital or index data → nationality marker with no person years', () => {
  const meta = personDateMetadata({});
  assert.deepEqual(meta, { dateSource: 'nationality' });
  assert.equal(hasFilterInterval(meta), false);
  assert.deepEqual(biographicalYearsFromMetadata(meta), {});
});

test('one-sided fine birth does not invent a death from elsewhere', () => {
  const meta = personDateMetadata({ birthYear: 1079, indexYear: 1100 });
  assert.equal(meta.dateSource, 'fine');
  assert.equal(meta.startYear, 1079);
  assert.equal(meta.endYear, undefined);
});
