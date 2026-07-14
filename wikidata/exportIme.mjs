/** Export Japanese raw person rows into a separate IME CSV table. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readNdjson } from '../shared/ndjson.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function csvCell(value) {
  const text = value == null ? '' : String(value);
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** @param {{ rawPath: string, outPath: string }} opts */
export function exportImeCsv(opts) {
  const rows = readNdjson(opts.rawPath);
  const lines = ['qid,surface,kana,yomiHiragana,birthYear,deathYear'];
  let count = 0;
  for (const row of rows) {
    for (const kana of row.nameInKana ?? []) {
      lines.push([
        row.qid,
        row.primaryLabel,
        kana,
        row.yomiHiragana,
        row.birthYear,
        row.deathYear,
      ].map(csvCell).join(','));
      count++;
    }
  }
  fs.mkdirSync(path.dirname(opts.outPath), { recursive: true });
  fs.writeFileSync(opts.outPath, `${lines.join('\n')}\n`);
  return { count, outPath: opts.outPath };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rawPath = arg('--raw', '');
  const outPath = arg('--out', path.join(ROOT, 'packs/wikidata/ime.csv'));
  if (!rawPath) {
    console.error('Usage: node wikidata/exportIme.mjs --raw PATH [--out PATH]');
    process.exit(1);
  }
  const result = exportImeCsv({ rawPath: path.resolve(rawPath), outPath: path.resolve(outPath) });
  console.log(`Exported ${result.count} IME rows -> ${result.outPath}`);
}
