import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChgisDilaCrosswalk, geoCompatible, GEO_THRESHOLD_DEG } from './buildChgisDila.mjs';

test('geoCompatible — within 0.5° passes as name+geo', () => {
  const result = geoCompatible({ lat: 32.0, lon: 112.1 }, { lat: 32.2, lon: 112.3 });
  assert.equal(result.ok, true);
  assert.equal(result.method, 'name+geo');
});

test('geoCompatible — beyond threshold fails', () => {
  const result = geoCompatible({ lat: 32.0, lon: 112.0 }, { lat: 33.5, lon: 112.0 });
  assert.equal(result.ok, false);
});

test('geoCompatible — missing coords is name-only', () => {
  const result = geoCompatible({ lat: 32.0, lon: 112.0 }, { lat: undefined, lon: undefined });
  assert.equal(result.ok, true);
  assert.equal(result.method, 'name-only');
});

test('buildChgisDilaCrosswalk — unique name+geo match', () => {
  const chgisRows = [
    {
      sys_id: '1001',
      name_ft: '襄陽',
      search_strings: '襄陽',
      lat: '32.01',
      lon: '112.12',
    },
  ];
  const dilaRows = [
    {
      pl_id: 'PL000000027120',
      primary_name: '襄陽',
      search_strings: '襄陽',
      lat: '32.02',
      lon: '112.15',
    },
    {
      pl_id: 'PL999',
      primary_name: '長安',
      search_strings: '長安',
      lat: '34.3',
      lon: '108.9',
    },
  ];
  const result = buildChgisDilaCrosswalk(chgisRows, dilaRows);
  assert.equal(result.stats.matched, 1);
  assert.equal(result.stats.ambiguous, 0);
  assert.ok(result.crosswalkLines.some((line) => line.includes('1001\tPL000000027120')));
});

test('buildChgisDilaCrosswalk — ambiguous when multiple DILA share name+geo', () => {
  const chgisRows = [
    {
      sys_id: '2001',
      name_ft: '新興郡',
      search_strings: '新興郡|新興',
      lat: '23.0',
      lon: '113.0',
    },
  ];
  const dilaRows = [
    {
      pl_id: 'PL_A',
      primary_name: '新興郡',
      search_strings: '新興郡',
      lat: '23.1',
      lon: '113.1',
    },
    {
      pl_id: 'PL_B',
      primary_name: '新興',
      search_strings: '新興',
      lat: '23.05',
      lon: '113.05',
    },
  ];
  const result = buildChgisDilaCrosswalk(chgisRows, dilaRows);
  assert.equal(result.stats.matched, 0);
  assert.equal(result.stats.ambiguous, 1);
});

test('GEO_THRESHOLD_DEG is 0.5', () => {
  assert.equal(GEO_THRESHOLD_DEG, 0.5);
});
