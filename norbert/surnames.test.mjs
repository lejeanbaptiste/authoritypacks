import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileNorbertSurnamesFromPersons } from './surnames.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const personsPath = path.resolve(__dirname, '../packs/norbert/persons.ndjson');

test('compileNorbertSurnamesFromPersons extracts family-type names', () => {
  const lines = fs.readFileSync(personsPath, 'utf8').split('\n').filter(Boolean).slice(0, 500);
  const persons = lines.map((line) => JSON.parse(line));
  const surnames = compileNorbertSurnamesFromPersons(persons);
  assert.ok(surnames.includes('成公'));
  assert.ok(surnames.indexOf('成公') < surnames.indexOf('公') || !surnames.includes('公'));
});
