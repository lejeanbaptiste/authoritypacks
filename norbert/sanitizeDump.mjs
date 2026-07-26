#!/usr/bin/env node
/**
 * Make a shareable, reduced Norbert SQL dump without the private/full dump.
 * The allowlist is intentional: new tables must be added explicitly.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_TABLES = new Set([
  'person',
  'person_names',
  'date_dynasties',
  'date_dynasty_names',
  'date_eras',
  'date_lunation_table',
  'nat_raw',
  'person_origin',
  'office',
  'person_offices',
  'biblio_work_names',
]);

/** Split a mysqldump into statements without treating quoted semicolons as delimiters. */
export function splitSqlStatements(sql) {
  const statements = [];
  let start = 0;
  let quote = null;
  let escaped = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === ';') {
      statements.push(sql.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (sql.slice(start).trim()) statements.push(sql.slice(start));
  return statements;
}

function tableIn(statement) {
  return statement.match(/\b(?:TABLE|INTO|TABLES?)\s+`([^`]+)`/i)?.[1]
    ?? statement.match(/\bALTER TABLE\s+`([^`]+)`/i)?.[1]
    ?? null;
}

/** @returns {{ statements: number, keptStatements: number, tables: string[] }} */
export function sanitizeNorbertDump(inputPath, outputPath, tables = DEFAULT_TABLES) {
  const wanted = new Set(tables);
  const kept = [];
  const seen = new Set();
  for (const statement of splitSqlStatements(fs.readFileSync(inputPath, 'utf8'))) {
    const table = tableIn(statement);
    if (table && !wanted.has(table) && !table.startsWith('date_')) continue;
    kept.push(statement);
    if (table) seen.add(table);
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, kept.join(''));
  return { statements: splitSqlStatements(fs.readFileSync(inputPath, 'utf8')).length, keptStatements: kept.length, tables: [...seen].sort() };
}

function arg(name, fallback) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] ?? fallback : fallback; }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const input = arg('--sql');
  const output = arg('--out', 'norbert_secret/norbert-authority.sql');
  if (!input) throw new Error('Usage: node norbert/sanitizeDump.mjs --sql PRIVATE_DUMP.sql [--out REDUCED.sql]');
  const extra = arg('--tables', '').split(',').map((v) => v.trim()).filter(Boolean);
  const tables = new Set([...DEFAULT_TABLES, ...extra]);
  const result = sanitizeNorbertDump(input, output, tables);
  console.log(`Norbert reduced dump: ${result.tables.join(', ')} → ${output}`);
}
