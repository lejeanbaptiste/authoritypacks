import test from 'node:test';
import assert from 'node:assert/strict';
import { splitSqlStatements, sanitizeNorbertDump } from './sanitizeDump.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('sanitizer keeps allowlisted tables and quoted semicolons', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'norbert-sanitize-'));
  const input = path.join(dir, 'full.sql');
  const output = path.join(dir, 'reduced.sql');
  fs.writeFileSync(input, "SET NAMES utf8mb4;\nCREATE TABLE `person` (`id` int);\nINSERT INTO `person` VALUES (1,'a;b');\nCREATE TABLE `knowledge_raw` (`id` int);\n");
  assert.equal(splitSqlStatements(fs.readFileSync(input, 'utf8')).length, 4);
  sanitizeNorbertDump(input, output);
  const reduced = fs.readFileSync(output, 'utf8');
  assert.match(reduced, /CREATE TABLE `person`/);
  assert.match(reduced, /a;b/);
  assert.doesNotMatch(reduced, /knowledge_raw/);
});
