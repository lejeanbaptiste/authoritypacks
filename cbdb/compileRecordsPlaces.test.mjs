import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { compileCbdbPlaces } from './compileRecords.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

/** Full dump — has ADDR_CODES with x_coord/y_coord; the committed fixture doesn't. */
const FULL_SQLITE_CANDIDATES = [
  process.env.CBDB_SQLITE,
  path.join(repoRoot, '.upstream/cbdb.sqlite3'),
  path.resolve(repoRoot, '../leaf-writer/test_project/authority-databases/cbdb.sqlite3'),
  path.resolve(repoRoot, '../leaf-writer/databases/cbdb_20260627.sqlite3'),
]
  .filter(Boolean)
  .find((p) => fs.existsSync(p));

function openDb(filePath) {
  return new Database(filePath, { readonly: true });
}

test(
  'CBDB places — geo coverage and sentinel filtering (integration)',
  { skip: !FULL_SQLITE_CANDIDATES },
  () => {
    const db = openDb(FULL_SQLITE_CANDIDATES);
    try {
      const places = compileCbdbPlaces(db, null);
      const total = places.length;
      const withGeo = places.filter((p) => p.metadata?.geo).length;

      assert.ok(total > 29_000 && total < 31_000, `unexpected total: ${total}`);
      // Audited coverage: ~15,487/30,100 (~51.5%) after excluding the (0,0) sentinel.
      assert.ok(withGeo > 15_000 && withGeo < 16_000, `unexpected geo coverage: ${withGeo}`);

      // No (0,0) null-island sentinel should ever surface as a real geo point.
      const nullIsland = places.filter(
        (p) => p.metadata?.geo?.lat === 0 && p.metadata?.geo?.lon === 0,
      );
      assert.equal(nullIsland.length, 0, 'sentinel (0,0) coordinates leaked into geo');

      // Axis sanity: for a plausible China record, lat/lon should not be swapped.
      const withPlausibleGeo = places.find(
        (p) =>
          p.metadata?.geo &&
          p.metadata.geo.lat > 18 &&
          p.metadata.geo.lat < 53 &&
          p.metadata.geo.lon > 73 &&
          p.metadata.geo.lon < 135,
      );
      assert.ok(withPlausibleGeo, 'expected at least one record with plausible China coordinates');
    } finally {
      db.close();
    }
  },
);

test(
  'CBDB places — admin-suffixed name variant generated for Xian (integration)',
  { skip: !FULL_SQLITE_CANDIDATES },
  () => {
    const db = openDb(FULL_SQLITE_CANDIDATES);
    try {
      const places = compileCbdbPlaces(db, null);
      const xianPlace = places.find(
        (p) => p.metadata?.subtype === 'Xian' && !p.primaryName.endsWith('縣'),
      );
      assert.ok(xianPlace, 'expected at least one bare-name Xian record');
      assert.ok(
        xianPlace.searchStrings.includes(`${xianPlace.primaryName}縣`),
        `expected suffixed variant for ${xianPlace.primaryName}`,
      );
    } finally {
      db.close();
    }
  },
);
