#!/usr/bin/env node
/**
 * Make a shareable, reduced Norbert SQL dump without the private/full dump.
 * The allowlist is intentional: new tables must be added explicitly.
 * date_* tables are NOT auto-kept — dynasty labels are extracted to a sidecar
 * JSON file when present in the private dump.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Public Norbert authority tables (see norbert/README.md). */
export const DEFAULT_TABLES = new Set([
  'person',
  'person_names',
  'codes_person_name_type',
  'nat_raw',
  'person_dynasties',
  'person_origin',
  'office',
  'officeholding_raw',
  'person_nt',
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
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === ';') {
      statements.push(sql.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (sql.slice(start).trim()) statements.push(sql.slice(start));
  return statements;
}

function tableIn(statement) {
  return (
    statement.match(/\b(?:TABLE|INTO|TABLES?)\s+`([^`]+)`/i)?.[1] ??
    statement.match(/\bALTER TABLE\s+`([^`]+)`/i)?.[1] ??
    null
  );
}

/**
 * Parse INSERT tuple blobs from a mysqldump table (best-effort).
 * @param {string} sql
 * @param {string} table
 * @returns {string[]}
 */
function extractInsertTuples(sql, table) {
  const rows = [];
  const pattern = new RegExp(`INSERT INTO \`${table}\` VALUES (.*?);\\n`, 'gs');
  for (const match of sql.matchAll(pattern)) {
    const blob = match[1];
    let i = 0;
    const n = blob.length;
    while (i < n) {
      while (i < n && ' \n\r\t,'.includes(blob[i])) i += 1;
      if (i >= n || blob[i] !== '(') break;
      let depth = 0;
      let inStr = false;
      let esc = false;
      const start = i;
      while (i < n) {
        const ch = blob[i];
        if (inStr) {
          if (esc) esc = false;
          else if (ch === '\\') esc = true;
          else if (ch === "'") inStr = false;
        } else if (ch === "'") inStr = true;
        else if (ch === '(') depth += 1;
        else if (ch === ')') {
          depth -= 1;
          if (depth === 0) {
            i += 1;
            rows.push(blob.slice(start, i));
            break;
          }
        }
        i += 1;
      }
    }
  }
  return rows;
}

function parseSqlTuple(tuple) {
  const inner = tuple.slice(1, -1);
  const vals = [];
  let i = 0;
  const n = inner.length;
  while (i < n) {
    while (i < n && ' \t\n\r'.includes(inner[i])) i += 1;
    if (i >= n) break;
    if (inner.startsWith('NULL', i) && (i + 4 === n || inner[i + 4] === ',')) {
      vals.push(null);
      i += 4;
    } else if (inner[i] === "'") {
      i += 1;
      let out = '';
      while (i < n) {
        if (inner[i] === '\\' && i + 1 < n) {
          out += inner[i + 1];
          i += 2;
          continue;
        }
        if (inner[i] === "'") {
          if (i + 1 < n && inner[i + 1] === "'") {
            out += "'";
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        out += inner[i];
        i += 1;
      }
      vals.push(out);
    } else {
      let j = i;
      while (j < n && inner[j] !== ',') j += 1;
      const raw = inner.slice(i, j).trim();
      const asInt = Number(raw);
      vals.push(Number.isFinite(asInt) && String(asInt) === raw ? asInt : raw);
      i = j;
    }
    if (i < n && inner[i] === ',') i += 1;
  }
  return vals;
}

/**
 * Extract id → { zh, en?, startYear?, endYear? } from private date_dynasties
 * without shipping the table in the public SQL dump.
 * @param {string} sql
 * @returns {Record<string, { zh: string, en?: string, startYear?: number, endYear?: number }>}
 */
export function extractDynastyLabelsFromSql(sql) {
  /** @type {Record<string, { zh: string, en?: string, startYear?: number, endYear?: number }>} */
  const out = {};
  for (const tuple of extractInsertTuples(sql, 'date_dynasties')) {
    const vals = parseSqlTuple(tuple);
    const id = vals[0];
    const zh = vals[1] == null ? '' : String(vals[1]).trim();
    if (id == null || !zh) continue;
    const en = vals[2] == null ? undefined : String(vals[2]).trim() || undefined;
    const startYear = typeof vals[3] === 'number' ? vals[3] : undefined;
    const endYear = typeof vals[4] === 'number' ? vals[4] : undefined;
    out[String(id)] = {
      zh,
      ...(en ? { en } : {}),
      ...(startYear != null ? { startYear } : {}),
      ...(endYear != null ? { endYear } : {}),
    };
  }
  return out;
}

/**
 * @returns {{
 *   statements: number,
 *   keptStatements: number,
 *   tables: string[],
 *   dynastyLabels?: Record<string, { zh: string, en?: string, startYear?: number, endYear?: number }>,
 * }}
 */
export function sanitizeNorbertDump(inputPath, outputPath, tables = DEFAULT_TABLES) {
  const wanted = new Set(tables);
  const sql = fs.readFileSync(inputPath, 'utf8');
  const statements = splitSqlStatements(sql);
  const kept = [];
  const seen = new Set();
  for (const statement of statements) {
    const table = tableIn(statement);
    // Strict allowlist: no date_* passthrough.
    if (table && !wanted.has(table)) continue;
    kept.push(statement);
    if (table) seen.add(table);
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, kept.join(''));

  const dynastyLabels = extractDynastyLabelsFromSql(sql);
  const labelsPath = path.join(path.dirname(outputPath), 'dynasty-labels.json');
  if (Object.keys(dynastyLabels).length > 0) {
    fs.writeFileSync(
      labelsPath,
      `${JSON.stringify({ dynasties: dynastyLabels, compiledAt: new Date().toISOString() }, null, 2)}\n`,
    );
  }

  return {
    statements: statements.length,
    keptStatements: kept.length,
    tables: [...seen].sort(),
    dynastyLabels,
  };
}

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const input = arg('--sql');
  const output = arg('--out', 'norbert_secret/norbert-authority.sql');
  if (!input) {
    throw new Error('Usage: node norbert/sanitizeDump.mjs --sql PRIVATE_DUMP.sql [--out REDUCED.sql]');
  }
  const extra = arg('--tables', '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  const tables = new Set([...DEFAULT_TABLES, ...extra]);
  const result = sanitizeNorbertDump(input, output, tables);
  const labelCount = Object.keys(result.dynastyLabels ?? {}).length;
  console.log(
    `Norbert reduced dump: ${result.tables.join(', ')} → ${output}` +
      (labelCount ? ` (+ ${labelCount} dynasty labels)` : ''),
  );
}
