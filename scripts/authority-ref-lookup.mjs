#!/usr/bin/env node
/**
 * CLI for A6 authorityRef:lookup — prints one JSON object to stdout.
 *
 *   node scripts/authority-ref-lookup.mjs --source cbdb --id 1762 --db PATH
 *   node scripts/authority-ref-lookup.mjs --source norbert --id person-1 --db PATH
 *   node scripts/authority-ref-lookup.mjs --source dila --id A000001 --xml PATH
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { lookupCbdbPerson } from '../cbdb/lookupPerson.mjs';
import { lookupNorbertPerson } from '../norbert/lookupPerson.mjs';
import { lookupDilaPerson } from '../dila/lookupPerson.mjs';

function arg(name, fallback = '') {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const source = arg('--source').toLowerCase();
const id = arg('--id');
if (!source || !id) {
  console.error('Usage: --source cbdb|norbert|dila --id ID [--db PATH|--xml PATH]');
  process.exit(2);
}

let result = null;
if (source === 'cbdb') {
  const dbPath = arg('--db');
  if (!dbPath || !fs.existsSync(dbPath)) throw new Error(`Missing CBDB db: ${dbPath}`);
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    result = lookupCbdbPerson(db, id);
  } finally {
    db.close();
  }
} else if (source === 'norbert') {
  const dbPath = arg('--db');
  if (!dbPath || !fs.existsSync(dbPath)) throw new Error(`Missing Norbert db: ${dbPath}`);
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    result = lookupNorbertPerson(db, id);
  } finally {
    db.close();
  }
} else if (source === 'dila') {
  const xmlPath = arg('--xml');
  if (!xmlPath || !fs.existsSync(xmlPath)) throw new Error(`Missing DILA xml: ${xmlPath}`);
  result = lookupDilaPerson(xmlPath, id);
} else {
  throw new Error(`Unknown source: ${source}`);
}

process.stdout.write(`${JSON.stringify(result)}\n`);
