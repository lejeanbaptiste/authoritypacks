#!/usr/bin/env node
/**
 * Repair compiled person packs: strip 姓 from courtesy/art/dharma names, then
 * collapse duplicate texts (安處厚 + 處厚 → 處厚). Also fix searchStrings that
 * accidentally doubled the surname (高 + 高斯立 → 高高斯立) when an ALTNAME
 * already included 姓.
 *
 * Prefer recompiling when possible; this script fixes already-built packs.
 *
 * Usage: node scripts/dedupeFamilyPrefixedNames.mjs [--dry-run] [file ...]
 */
import {
  createReadStream,
  createWriteStream,
  existsSync,
  renameSync,
  unlinkSync,
} from 'node:fs';
import { createInterface } from 'node:readline';
import { finished } from 'node:stream/promises';
import {
  collapseTypedNamesAfterZiClean,
  stripFamilyPrefixFromCourtesyName,
} from '../norbert/personNames.mjs';
import { normalizeSurface } from '../shared/normalize.mjs';

const DEFAULT_FILES = [
  'packs/cbdb/persons.ndjson',
  'packs/dila/persons.ndjson',
  'packs/norbert/persons.ndjson',
  'packs/wikidata/person-zh-hant-tang/persons.ndjson',
  'packs/wikidata/person-zh-hant-pre-ming/persons.ndjson',
  'packs/wikidata/person-zh-hant-ming/persons.ndjson',
  'packs/wikidata/person-zh-hant-qing/persons.ndjson',
  'packs/wikidata/person-ja-japan/persons.ndjson',
  'packs/wikidata/person-bo/persons.ndjson',
];

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const fileArgs = args.filter((a) => !a.startsWith('--'));
const files = fileArgs.length > 0 ? fileArgs : DEFAULT_FILES;

let totalTouched = 0;
let totalDropped = 0;
let totalSearchFixed = 0;

/**
 * Collapse 姓+姓+字 search forms left by older compiles that concatenated
 * surname onto an ALTNAME that already included 姓.
 *
 * @param {string[]} searchStrings
 * @param {string[]} familyNames
 * @returns {{ strings: string[], fixed: number }}
 */
function repairDoubledSurnameSearch(searchStrings, familyNames) {
  if (!Array.isArray(searchStrings) || familyNames.length === 0) {
    return { strings: searchStrings ?? [], fixed: 0 };
  }
  /** @type {Map<string, true>} */
  const out = new Map();
  let fixed = 0;
  for (const raw of searchStrings) {
    const s = normalizeSurface(raw);
    if (!s) continue;
    const once = stripFamilyPrefixFromCourtesyName(s, familyNames);
    if (once !== s) {
      const twice = stripFamilyPrefixFromCourtesyName(once, familyNames);
      if (twice !== once) {
        // Prefer longest family so 司馬+司馬長卿 → 司馬長卿, not 司+…
        let bestFamily = '';
        for (const familyName of familyNames) {
          const f = normalizeSurface(familyName);
          if (f.length > bestFamily.length && s.startsWith(f + f)) bestFamily = f;
        }
        const repaired = bestFamily ? bestFamily + twice : twice;
        if (repaired !== s) fixed++;
        if (repaired) out.set(repaired, true);
        continue;
      }
    }
    out.set(s, true);
  }
  return { strings: [...out.keys()], fixed };
}

/**
 * @param {{ text: string, type: string }[]} names
 */
function familyNamesFrom(names) {
  return names.filter((n) => n.type === 'family').map((n) => n.text).filter(Boolean);
}

for (const file of files) {
  if (!existsSync(file)) {
    console.log(`skip (missing): ${file}`);
    continue;
  }

  const tmp = `${file}.dedupe.tmp`;
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  const out = dryRun ? null : createWriteStream(tmp);

  let touched = 0;
  let dropped = 0;
  let searchFixed = 0;
  let records = 0;

  try {
    for await (const line of rl) {
      if (!line.trim()) continue;
      records++;
      const record = JSON.parse(line);
      let changed = false;

      if (Array.isArray(record.names) && record.names.length > 0) {
        const before = record.names.length;
        const collapsed = collapseTypedNamesAfterZiClean(record.names);
        if (JSON.stringify(record.names) !== JSON.stringify(collapsed)) {
          dropped += before - collapsed.length;
          record.names = collapsed;
          changed = true;
        }
      }

      if (Array.isArray(record.searchStrings) && Array.isArray(record.names)) {
        const { strings, fixed } = repairDoubledSurnameSearch(
          record.searchStrings,
          familyNamesFrom(record.names),
        );
        if (fixed > 0 || JSON.stringify(record.searchStrings) !== JSON.stringify(strings)) {
          searchFixed += fixed;
          record.searchStrings = strings;
          changed = true;
        }
      }

      if (changed) {
        touched++;
        out?.write(`${JSON.stringify(record)}\n`);
      } else {
        out?.write(`${line}\n`);
      }
    }

    if (out) {
      out.end();
      await finished(out);
      if (touched > 0) {
        renameSync(tmp, file);
      } else {
        unlinkSync(tmp);
      }
    }
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    throw err;
  }

  totalTouched += touched;
  totalDropped += dropped;
  totalSearchFixed += searchFixed;
  console.log(
    `${file}: ${records} records, ${touched} rewritten, ${dropped} name(s) dropped, ${searchFixed} search string(s) fixed${dryRun ? ' (dry run)' : ''}`,
  );
}

console.log(
  `\nTotal: ${totalTouched} record(s) rewritten, ${totalDropped} name(s) dropped, ${totalSearchFixed} search string(s) fixed${dryRun ? ' (dry run — no files written)' : ''}`,
);
