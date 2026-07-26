import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileGeoAdminSuffixes,
  compileNorbertOffices,
  GEO_ADMIN_PLACE_CAT,
  officeRowToCandidate,
} from './compileOffices.mjs';
import { OFFICE_COL } from './officeColumns.mjs';

/** Build a sparse office row with only the fields under test. */
function officeRow(overrides = {}) {
  /** @type {any[]} */
  const row = new Array(27).fill(null);
  row[OFFICE_COL.id] = 1;
  row[OFFICE_COL.fullString] = '侍中';
  for (const [key, value] of Object.entries(overrides)) {
    row[OFFICE_COL[key]] = value;
  }
  return row;
}

test('officeRowToCandidate maps full_string to roleName office candidate', () => {
  const candidate = officeRowToCandidate(officeRow({ id: 42, fullString: '侍中' }));
  assert.equal(candidate?.kind, 'office');
  assert.equal(candidate?.primaryName, '侍中');
  assert.deepEqual(candidate?.searchStrings, ['侍中']);
  assert.equal(candidate?.metadata?.teiTag, 'roleName');
  assert.equal(candidate?.authorityId, '42');
});

test('geo-admin suffix 令 gets placeCat and geoAdminSuffix flags', () => {
  const candidate = officeRowToCandidate(
    officeRow({ id: 397, fullString: '令', followsPlace: 1 }),
  );
  assert.equal(candidate?.metadata?.geoAdminSuffix, true);
  assert.equal(candidate?.metadata?.placeCat, GEO_ADMIN_PLACE_CAT['令']);
  assert.equal(candidate?.metadata?.followsPlace, true);
});

test('office cat 曹 is not treated as administrative placeCat', () => {
  const candidate = officeRowToCandidate(
    officeRow({ id: 1, fullString: '三公曹', cat: '曹', isSite: 1 }),
  );
  assert.equal(candidate?.metadata?.placeCat, undefined);
  assert.equal(candidate?.metadata?.geoAdminSuffix, undefined);
});

test('compileGeoAdminSuffixes collects flagged offices', () => {
  const offices = compileNorbertOffices([
    officeRow({ id: 1, fullString: '侍中' }),
    officeRow({ id: 397, fullString: '令', followsPlace: 1 }),
    officeRow({ id: 660, fullString: '太守' }),
  ]);
  const suffixes = compileGeoAdminSuffixes(offices);
  assert.deepEqual(
    suffixes.map((s) => s.string),
    ['令', '太守'],
  );
  assert.equal(suffixes.find((s) => s.string === '令')?.placeCat, '縣');
});
