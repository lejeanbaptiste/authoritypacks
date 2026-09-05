import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { writeDateChunks } from './dateChunks.mjs';
import { readNdjson } from './ndjson.mjs';

test('date chunks preserve entities/search strings and repeat boundary spans', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grognard-date-chunks-'));
  try {
    const rows = [
      { source: 'Test', authorityId: 'one', searchStrings: ['甲'], metadata: { startYear: 199, endYear: 201 } },
      { source: 'Test', authorityId: 'two', searchStrings: ['乙'], metadata: {} },
      { source: 'Test', authorityId: 'three', searchStrings: ['丙'], metadata: { startYear: 0, endYear: 1900 } },
    ];
    const layout = writeDateChunks(dir, 'persons.ndjson', rows, { blockYears: 200 });
    assert.equal(layout.distinctEntityCount, 3);
    assert.equal(layout.distinctStringCount, 3);
    assert.equal(layout.chunks.length, 2);
    assert.ok(layout.undatedPath);
    const dated = layout.chunks.flatMap((chunk) => readNdjson(path.join(dir, chunk.path)));
    assert.equal(dated.filter((row) => row.authorityId === 'one').length, 2);
    assert.deepEqual(
      readNdjson(path.join(dir, layout.undatedPath)).map((row) => row.authorityId).sort(),
      ['three', 'two'],
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
