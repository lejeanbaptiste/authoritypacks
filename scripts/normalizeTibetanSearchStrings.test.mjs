import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(__dirname, 'normalizeTibetanSearchStrings.mjs');

const run = (file) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'grognard-bo-'));
  const packDir = path.join(tmp, 'persons');
  fs.mkdirSync(packDir, { recursive: true });
  const p = path.join(packDir, 'persons.ndjson');
  fs.writeFileSync(p, file.map((r) => JSON.stringify(r)).join('\n') + '\n');
  execFileSync('node', [script, '--path', p], { stdio: 'pipe' });
  const out = fs
    .readFileSync(p, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  fs.rmSync(tmp, { recursive: true, force: true });
  return out;
};

test('strips terminal shad, folds U+0F0C, dedupes, keeps primaryName', () => {
  const [row] = run([
    {
      authorityId: 'X1',
      primaryName: 'བཀྲ་ཤིས།',
      searchStrings: ['བཀྲ་ཤིས།', 'བཀྲ་ཤིས', 'བཀྲ༌ཤིས'],
    },
  ]);
  assert.equal(row.primaryName, 'བཀྲ་ཤིས།');
  assert.deepEqual(row.searchStrings, ['བཀྲ་ཤིས']);
});

test('leaves non-Tibetan rows untouched', () => {
  const input = [{ authorityId: 'X2', primaryName: '張衡', searchStrings: ['張衡', '平子'] }];
  assert.deepEqual(run(input), input);
});

test('keeps interior tshegs', () => {
  const [row] = run([{ authorityId: 'X3', searchStrings: ['ཙོང་ཁ་པ།'] }]);
  assert.deepEqual(row.searchStrings, ['ཙོང་ཁ་པ']);
});
