import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGeoFromLocation } from '../dila/compileRecords.mjs';
import { loadChgisDilaCrosswalk } from './loadChgisDila.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('parseGeoFromLocation — lat/long children', () => {
  const geo = parseGeoFromLocation([{ geo: { lat: '32.01', long: '112.12' } }]);
  assert.deepEqual(geo, { lat: 32.01, lon: 112.12 });
});

test('parseGeoFromLocation — space-separated coordinates text', () => {
  const geo = parseGeoFromLocation([{ geo: { '#text': '32.01 112.12' } }]);
  assert.deepEqual(geo, { lat: 32.01, lon: 112.12 });
});

test('loadChgisDilaCrosswalk — reads TSV into bidirectional maps', () => {
  const tmp = path.join(__dirname, '../reports/test-crosswalk.tsv');
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  fs.writeFileSync(
    tmp,
    'chgis_sys_id\tdila_pl_id\tmatch_method\tdelta_lat\tdelta_lon\tname\n1001\tPL001\tname+geo\t0.01\t0.02\t襄陽\n',
  );
  const { chgisToDila, dilaToChgis } = loadChgisDilaCrosswalk(tmp);
  assert.equal(chgisToDila.get('1001'), 'PL001');
  assert.equal(dilaToChgis.get('PL001'), '1001');
  fs.unlinkSync(tmp);
});
