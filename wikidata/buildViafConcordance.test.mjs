import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, 'buildViafConcordance.mjs');

test('buildViafConcordance collects VIAF↔Wikidata pairs from pack NDJSON', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'viaf-conc-'));
  const input = path.join(dir, 'places.ndjson');
  const output = path.join(dir, 'viaf-wikidata-concordance.ndjson');
  fs.writeFileSync(
    input,
    [
      JSON.stringify({
        authorityId: 'Q31',
        metadata: { crosswalk: { viaf: '144248059', wikidata: ['31'] } },
      }),
      JSON.stringify({
        authorityId: 'Q45',
        metadata: { crosswalk: { viaf: '153009195' } },
      }),
      JSON.stringify({ authorityId: 'Q999', metadata: { crosswalk: { cbdb: '1' } } }),
      '',
    ].join('\n'),
    'utf8',
  );

  const result = spawnSync(process.execPath, [script, '--in', input, '--out', output], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const lines = fs.readFileSync(output, 'utf8').trim().split('\n');
  assert.equal(lines.length, 2);
  const parsed = lines.map((line) => JSON.parse(line));
  assert.deepEqual(parsed, [
    { wikidata: 'Q31', viaf: '144248059' },
    { wikidata: 'Q45', viaf: '153009195' },
  ]);
});
