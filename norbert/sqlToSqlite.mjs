#!/usr/bin/env node
/**
 * Convert the public Norbert MySQL dump into a reference SQLite database.
 *
 * Loads allowlisted tables from norbert-authority.sql and embeds dynasty labels
 * (from dynasty-labels.json) so lookup does not need a sidecar file.
 *
 * Usage:
 *   node norbert/sqlToSqlite.mjs --sql PATH --labels PATH --out norbert.sqlite3
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { loadTableRows } from './parseSqlDump.mjs';
import { DEFAULT_TABLES } from './sanitizeDump.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/**
 * Extract CREATE TABLE bodies from a mysqldump and map to SQLite DDL.
 * @param {string} sql
 * @param {Set<string>} wanted
 * @returns {Map<string, { columns: string[], ddl: string }>}
 */
export function extractSqliteSchemas(sql, wanted = DEFAULT_TABLES) {
  /** @type {Map<string, { columns: string[], ddl: string }>} */
  const out = new Map();
  const re = /CREATE TABLE `([^`]+)`\s*\(([\s\S]*?)\)\s*ENGINE=/gi;
  for (const match of sql.matchAll(re)) {
    const table = match[1];
    if (!wanted.has(table)) continue;
    const body = match[2];
    /** @type {string[]} */
    const columns = [];
    /** @type {string[]} */
    const colDefs = [];
    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim().replace(/,$/, '');
      if (!line.startsWith('`')) continue;
      const name = line.match(/^`([^`]+)`/)?.[1];
      if (!name) continue;
      columns.push(name);
      const rest = line.slice(name.length + 2).trim();
      let type = 'TEXT';
      if (/^(tiny|small|medium|big)?int|bit|year/i.test(rest)) type = 'INTEGER';
      else if (/^(float|double|decimal|real)/i.test(rest)) type = 'REAL';
      else if (/^blob|binary|varbinary/i.test(rest)) type = 'BLOB';
      colDefs.push(`"${name}" ${type}`);
    }
    if (!columns.length) continue;
    out.set(table, {
      columns,
      ddl: `CREATE TABLE "${table}" (${colDefs.join(', ')})`,
    });
  }
  return out;
}

/**
 * @param {{
 *   sqlPath: string,
 *   labelsPath?: string | null,
 *   outPath: string,
 *   tables?: Set<string>,
 * }} options
 */
export async function buildNorbertSqlite({
  sqlPath,
  labelsPath = null,
  outPath,
  tables = DEFAULT_TABLES,
}) {
  if (!fs.existsSync(sqlPath)) throw new Error(`Missing SQL dump: ${sqlPath}`);
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const schemas = extractSqliteSchemas(sql, tables);
  if (!schemas.size) throw new Error(`No CREATE TABLE schemas found in ${sqlPath}`);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
  const db = new Database(outPath);
  db.pragma('journal_mode = OFF');
  db.pragma('synchronous = OFF');

  try {
    db.exec('BEGIN');
    for (const [table, schema] of schemas) {
      db.exec(schema.ddl);
      const placeholders = schema.columns.map(() => '?').join(', ');
      const insert = db.prepare(
        `INSERT INTO "${table}" (${schema.columns.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders})`,
      );
      const insertMany = db.transaction((rows) => {
        for (const row of rows) {
          const vals = schema.columns.map((_, i) => {
            const v = row[i];
            if (Buffer.isBuffer(v)) return v.length ? 1 : 0;
            return v;
          });
          insert.run(...vals);
        }
      });
      /** @type {any[][]} */
      const batch = [];
      for await (const row of loadTableRows(sqlPath, table)) {
        batch.push(row);
        if (batch.length >= 500) {
          insertMany(batch);
          batch.length = 0;
        }
      }
      if (batch.length) insertMany(batch);
    }

    db.exec(`CREATE TABLE dynasty_labels (
      id INTEGER PRIMARY KEY,
      zh TEXT NOT NULL,
      en TEXT,
      start_year INTEGER,
      end_year INTEGER
    )`);
    if (labelsPath && fs.existsSync(labelsPath)) {
      const raw = JSON.parse(fs.readFileSync(labelsPath, 'utf8'));
      const dynasties = raw.dynasties ?? raw;
      const insertLabel = db.prepare(
        `INSERT INTO dynasty_labels (id, zh, en, start_year, end_year) VALUES (?, ?, ?, ?, ?)`,
      );
      const insertLabels = db.transaction((entries) => {
        for (const [id, info] of entries) {
          if (!info?.zh) continue;
          insertLabel.run(
            Number(id),
            String(info.zh),
            info.en ?? null,
            info.startYear ?? null,
            info.endYear ?? null,
          );
        }
      });
      insertLabels(Object.entries(dynasties));
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    db.close();
  }

  return {
    outPath,
    tables: [...schemas.keys()].sort(),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const defaultSql = path.resolve(__dirname, '../norbert_secret/norbert-authority.sql');
  const defaultLabels = path.resolve(__dirname, '../norbert_secret/dynasty-labels.json');
  const sqlPath = path.resolve(arg('--sql', fs.existsSync(defaultSql)
    ? defaultSql
    : path.resolve(__dirname, '../norbert_public/norbert-authority.sql')));
  const labelsPath = arg('--labels', fs.existsSync(defaultLabels) ? defaultLabels : '');
  const outPath = path.resolve(arg('--out', path.resolve(__dirname, '../dist/reference/norbert.sqlite3')));
  const t0 = Date.now();
  buildNorbertSqlite({
    sqlPath,
    labelsPath: labelsPath || null,
    outPath,
  }).then((result) => {
    const mb = (fs.statSync(result.outPath).size / 1e6).toFixed(2);
    console.log(`Norbert sqlite: ${result.tables.join(', ')} → ${result.outPath} (${mb} MB, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
