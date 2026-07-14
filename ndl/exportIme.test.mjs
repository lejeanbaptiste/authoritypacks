import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportImeCsv } from './exportIme.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(__dirname, 'fixtures');
const outPath = path.join(__dirname, '../packs/test-ndl/ime.csv');

test('exportImeCsv — writes kana readings for IME, keyed by authorityId', () => {
  const rawPath = path.join(fixtures, 'sample-persons.raw.ndjson');
  const result = exportImeCsv({ rawPath, outPath });
  assert.ok(result.count > 0);

  const csv = fs.readFileSync(outPath, 'utf8');
  const lines = csv.trim().split('\n');
  assert.equal(lines[0], 'authorityId,surface,kana,yomiHiragana,birthYear,deathYear');
  assert.ok(lines.some((l) => l.startsWith('00054222,夏目漱石,')));
});
