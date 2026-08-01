import test from 'node:test';
import assert from 'node:assert/strict';
import { splitSqlStatements, sanitizeNorbertDump, DEFAULT_TABLES } from './sanitizeDump.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('sanitizer keeps allowlisted tables and quoted semicolons', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'norbert-sanitize-'));
  const input = path.join(dir, 'full.sql');
  const output = path.join(dir, 'reduced.sql');
  fs.writeFileSync(
    input,
    "SET NAMES utf8mb4;\nCREATE TABLE `person` (`id` int);\nINSERT INTO `person` VALUES (1,'a;b');\nCREATE TABLE `knowledge_raw` (`id` int);\n",
  );
  assert.equal(splitSqlStatements(fs.readFileSync(input, 'utf8')).length, 4);
  sanitizeNorbertDump(input, output);
  const reduced = fs.readFileSync(output, 'utf8');
  assert.match(reduced, /CREATE TABLE `person`/);
  assert.match(reduced, /a;b/);
  assert.doesNotMatch(reduced, /knowledge_raw/);
});

test('sanitizer does not auto-keep date_* tables', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'norbert-sanitize-'));
  const input = path.join(dir, 'full.sql');
  const output = path.join(dir, 'reduced.sql');
  fs.writeFileSync(
    input,
    [
      'CREATE TABLE `person` (`id` int);',
      'CREATE TABLE `date_dynasties` (`id` int, `can_name` text, `en_name` text, `start_year` int, `end_year` int);',
      "INSERT INTO `date_dynasties` VALUES (46,'漢','Han',-202,220);",
      'CREATE TABLE `date_eras` (`id` int);',
      'CREATE TABLE `person_dynasties` (`ind` int, `person_id` int, `dyn_id` int);',
      '',
    ].join('\n'),
  );
  const result = sanitizeNorbertDump(input, output);
  const reduced = fs.readFileSync(output, 'utf8');
  assert.match(reduced, /CREATE TABLE `person`/);
  assert.match(reduced, /CREATE TABLE `person_dynasties`/);
  assert.doesNotMatch(reduced, /CREATE TABLE `date_dynasties`/);
  assert.doesNotMatch(reduced, /CREATE TABLE `date_eras`/);
  assert.ok(!result.tables.includes('date_dynasties'));
  assert.ok(!result.tables.includes('date_eras'));
  assert.equal(result.dynastyLabels?.['46']?.zh, '漢');
  assert.ok(DEFAULT_TABLES.has('officeholding_raw'));
  assert.ok(!DEFAULT_TABLES.has('date_dynasties'));
});
