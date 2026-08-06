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

test('year 0 is not a biographical birth/death', () => {
  const meta = personDateMetadata({ birthYear: 0, deathYear: 522 });
  assert.equal(meta.dateSource, 'fine');
  assert.equal(meta.startYear, undefined);
  assert.equal(meta.endYear, 522);
  assert.deepEqual(biographicalYearsFromMetadata(meta), { endYear: 522 });
});

test('floruit of 0/0 is dropped (CBDB unknown sentinel)', () => {
  const meta = personDateMetadata({ flEarliest: 0, flLatest: 0, indexYear: 0 });
  assert.deepEqual(meta, { dateSource: 'nationality' });
  assert.equal(hasFilterInterval(meta), false);
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
