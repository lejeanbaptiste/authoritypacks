import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { placeFromChgisRow } from './compileRecords.mjs';
import { chgisStemName } from './fieldMap.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('CHGIS — stem name drops zhuan ming', () => {
  assert.equal(chgisStemName('保德州', '州'), '保德');
  assert.equal(chgisStemName('新興郡', '郡'), '新興');
  assert.equal(chgisStemName('保德', '州'), undefined);
  assert.equal(chgisStemName('郡', '郡'), undefined);
});

test('CHGIS — prefers NAME_FT over NAME_CH', () => {
  const row = {
    NAME_FT: '保德縣',
    NAME_CH: '保德县',
    TYPE_CH: '縣',
    NAME_PY: 'Baode Xian',
    BEG_YR: 1374,
    END_YR: 1376,
    SYS_ID: 95003,
    OBJ_TYPE: 'POINT',
    PRES_LOC: '山西保德县城西侧',
    lat: 39.02,
    lon: 111.08,
  };
  const place = placeFromChgisRow(row, {
    cbdbByChgisId: new Map([['95002', '3535']]),
  });
  assert.ok(place);
  assert.equal(place.authorityId, '95003');
  assert.equal(place.primaryName, '保德縣');
  assert.ok(place.searchStrings.includes('保德縣'));
  assert.ok(place.searchStrings.includes('保德'));
  assert.equal(place.metadata?.nameCh, '保德县');
  assert.equal(place.metadata?.nameFt, '保德縣');
  assert.equal(place.metadata?.geo?.lat, 39.02);
  assert.equal(place.metadata?.startYear, 1374);
  assert.equal(place.metadata?.crosswalk?.chgis, '95003');
  assert.equal(place.metadata?.crosswalk?.cbdb, undefined);
});

test('CHGIS — 新興郡 yields full name and stem', () => {
  const row = {
    NAME_FT: '新興郡',
    TYPE_CH: '郡',
    SYS_ID: 99001,
    OBJ_TYPE: 'POINT',
  };
  const place = placeFromChgisRow(row);
  assert.ok(place?.searchStrings.includes('新興郡'));
  assert.ok(place?.searchStrings.includes('新興'));
});

test('CHGIS — CBDB crosswalk when SYS_ID matches CHGIS_PT_ID', () => {
  const row = {
    NAME_FT: '保德縣',
    NAME_CH: '保德县',
    TYPE_CH: '縣',
    BEG_YR: 1171,
    END_YR: 1256,
    SYS_ID: 95002,
    OBJ_TYPE: 'POINT',
  };
  const place = placeFromChgisRow(row, {
    cbdbByChgisId: new Map([['95002', '3535']]),
  });
  assert.equal(place?.metadata?.crosswalk?.cbdb, '3535');
  assert.equal(place?.metadata?.crosswalk?.chgis, '95002');
});

test('CHGIS — DILA crosswalk when provided', () => {
  const row = {
    NAME_FT: '襄陽',
    TYPE_CH: '縣',
    SYS_ID: 12345,
    OBJ_TYPE: 'POINT',
  };
  const place = placeFromChgisRow(row, {
    dilaByChgisId: new Map([['12345', 'PL000000027120']]),
  });
  assert.equal(place?.metadata?.crosswalk?.dila, 'PL000000027120');
});

test('CHGIS — skips polygon rows', () => {
  const row = {
    NAME_FT: '福建路',
    TYPE_CH: '路',
    SYS_ID: 98000,
    OBJ_TYPE: 'POLYGON',
  };
  assert.equal(placeFromChgisRow(row), null);
});

test(
  'CHGIS — integration compile on county points layer',
  { skip: !fs.existsSync('/tmp/chgis-inspect/v6_time_cnty_pts_utf.shp') },
  async () => {
    const { compileChgisPack } = await import('./compile.mjs');
    const outDir = path.join(__dirname, '../packs/chgis-test');
    const result = await compileChgisPack({
      inputPath: '/tmp/chgis-inspect',
      outDir,
      cbdbSqlite: path.resolve(__dirname, '../../leaf-writer/databases/cbdb_20260627.sqlite3'),
    });
    assert.ok(result.places > 10_000);
    assert.ok(result.crosswalkCount > 100);
  },
);
