#!/usr/bin/env node
/**
 * Quick audit: short / office-like / place-like Wikidata person names.
 *
 *   node scripts/analyze-wikidata-person-name-quality.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readNdjson } from '../shared/ndjson.mjs';
import { codePointLength } from '../shared/personStringPolicy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ZH_PERSON_PACKS = [
  'person-zh-hant-pre-ming',
  'person-zh-hant-ming',
  'person-zh-hant-qing',
  'person-zh-hant-tang',
];

/** Common office / title suffixes (not exhaustive). */
const OFFICE_SUFFIX_RE = /(?:公|侯|王|帝|后|妃|太子|太后|夫人|大夫|將軍|将军|侍郎|尚書|尚书|太守|刺史|御史|丞相|宰相|宰相|禪師|禅师|和尚|法師|法师|居士|先生|居士)$/u;

/** Era-name style: two Han chars ending 元/初/中/末/興/兴/平/和/治/德/武/文/成/景/昭/永/天| etc. */
const ERA_STYLE_RE = /^[\u4e00-\u9fff]{2}$/u;
const ERA_SECOND_CHAR_RE = /[元初末興兴平化和德武文成景昭永天正建元寶大開开貞贞乾干寶義义]/u;

/** Place-ish suffixes on 2-char strings. */
const PLACE_SUFFIX_RE = /(?:州|郡|縣|县|城|山|河|江|湖|海|關|关|口|渡|陵|墓|寺|廟|庙|觀|观|坊|里|村|鎮|镇|島|岛)$/u;

function loadPack(rel) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) return [];
  return readNdjson(file);
}

function collectSurfaces(records, { field = 'primaryName', includeSearchStrings = false } = {}) {
  /** @type {Map<string, { count: number, examples: any[] }>} */
  const map = new Map();
  const add = (surface, record, pack) => {
    const key = String(surface ?? '').trim();
    if (!key) return;
    const entry = map.get(key) ?? { count: 0, examples: [] };
    entry.count++;
    if (entry.examples.length < 3) {
      entry.examples.push({
        pack,
        authorityId: record.authorityId,
        primaryName: record.primaryName,
        description: record.metadata?.description,
      });
    }
    map.set(key, entry);
  };
  for (const pack of ZH_PERSON_PACKS) {
    const file = path.join(root, 'packs/wikidata', pack, 'persons.ndjson');
    if (!fs.existsSync(file)) continue;
    for (const record of readNdjson(file)) {
      if (field === 'primaryName') add(record.primaryName, record, pack);
      if (includeSearchStrings) {
        for (const s of record.searchStrings ?? []) add(s, record, pack);
      }
    }
  }
  return map;
}

function buildReferenceSets() {
  const cbdbOffices = loadPack('packs/cbdb/offices.ndjson');
  const cbdbPlaces = loadPack('packs/cbdb/places.ndjson');
  const wikidataPlaces = [
    ...loadPack('packs/wikidata/place-zh-hant/places.ndjson'),
  ];
  const dilaPersons = loadPack('packs/dila/persons.ndjson');
  const norbertOffices = loadPack('packs/norbert/offices.ndjson');

  const officeNames = new Set();
  for (const row of [...cbdbOffices, ...norbertOffices]) {
    officeNames.add(row.primaryName);
    for (const s of row.searchStrings ?? []) officeNames.add(s);
  }

  const placeNames = new Set();
  for (const row of [...cbdbPlaces, ...wikidataPlaces]) {
    placeNames.add(row.primaryName);
    for (const s of row.searchStrings ?? []) placeNames.add(s);
  }

  return { officeNames, placeNames, dilaPersons, cbdbOffices: cbdbOffices.length, cbdbPlaces: cbdbPlaces.length };
}

function classifyTwoChar(surface) {
  const tags = [];
  if (officeNames.has(surface)) tags.push('office-exact');
  if (placeNames.has(surface)) tags.push('place-exact');
  if (OFFICE_SUFFIX_RE.test(surface)) tags.push('office-suffix');
  if (PLACE_SUFFIX_RE.test(surface)) tags.push('place-suffix');
  if (ERA_STYLE_RE.test(surface) && ERA_SECOND_CHAR_RE.test(surface[1])) tags.push('era-style');
  if (/^(?:子|仲|叔|季|小|大)[\u4e00-\u9fff]$/u.test(surface)) tags.push('courtesy-style');
  if (/^[\u4e00-\u9fff]氏$/u.test(surface)) tags.push('clan-氏');
  if (/^[\u4e00-\u9fff]山$/u.test(surface)) tags.push('mountain');
  if (tags.length === 0) tags.push('other-2char');
  return tags;
}

const { officeNames, placeNames, dilaPersons, cbdbOffices, cbdbPlaces } = buildReferenceSets();

/** @type {{ pack: string, records: any[] }[]} */
const packData = [];
let totalPersons = 0;
let twoCharPrimary = 0;
/** @type {Map<string, number>} */
const tagCounts = new Map();
/** @type {any[]} */
const flaggedExamples = [];

for (const pack of ZH_PERSON_PACKS) {
  const file = path.join(root, 'packs/wikidata', pack, 'persons.ndjson');
  if (!fs.existsSync(file)) continue;
  const records = readNdjson(file);
  packData.push({ pack, records });
  totalPersons += records.length;

  for (const record of records) {
    const primary = record.primaryName;
    if (codePointLength(primary) !== 2) continue;
    twoCharPrimary++;
    const tags = classifyTwoChar(primary);
    for (const tag of tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    if (
      tags.includes('office-exact')
      || tags.includes('place-exact')
      || tags.includes('office-suffix')
      || tags.includes('era-style')
    ) {
      flaggedExamples.push({
        pack,
        authorityId: record.authorityId,
        primaryName: primary,
        tags,
        description: record.metadata?.description,
        searchStrings: record.searchStrings,
      });
    }
  }
}

// Office-exact primary names (any length)
let officeExactPrimary = 0;
/** @type {any[]} */
const officeExactExamples = [];
for (const { pack, records } of packData) {
  for (const record of records) {
    if (!officeNames.has(record.primaryName)) continue;
    officeExactPrimary++;
    if (officeExactExamples.length < 40) {
      officeExactExamples.push({
        pack,
        authorityId: record.authorityId,
        primaryName: record.primaryName,
        description: record.metadata?.description,
      });
    }
  }
}

// Two-char search strings where primary is longer (alias leak)
let twoCharAliasOnLongPrimary = 0;
/** @type {any[]} */
const aliasLeakExamples = [];
for (const { pack, records } of packData) {
  for (const record of records) {
    if (codePointLength(record.primaryName) <= 2) continue;
    for (const s of record.searchStrings ?? []) {
      if (codePointLength(s) !== 2) continue;
      twoCharAliasOnLongPrimary++;
      const tags = classifyTwoChar(s);
      if (aliasLeakExamples.length < 30) {
        aliasLeakExamples.push({
          pack,
          authorityId: record.authorityId,
          primaryName: record.primaryName,
          alias: s,
          tags,
        });
      }
    }
  }
}

// DILA comparison: 2-char primary + office-exact primary
let dilaTwoChar = 0;
let dilaOfficeExact = 0;
for (const record of dilaPersons) {
  if (codePointLength(record.primaryName) === 2) dilaTwoChar++;
  if (officeNames.has(record.primaryName)) dilaOfficeExact++;
}

// Top recurring 2-char primaries
/** @type {Map<string, number>} */
const twoCharFreq = new Map();
for (const { records } of packData) {
  for (const record of records) {
    if (codePointLength(record.primaryName) !== 2) continue;
    const k = record.primaryName;
    twoCharFreq.set(k, (twoCharFreq.get(k) ?? 0) + 1);
  }
}
const topTwoChar = [...twoCharFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);

function pct(n, d) {
  return d ? `${((n / d) * 100).toFixed(2)}%` : 'n/a';
}

console.log('=== Wikidata Chinese person name quality audit ===\n');
console.log(`Reference sets: ${cbdbOffices} CBDB offices, ${cbdbPlaces} CBDB places, ${officeNames.size} office surfaces, ${placeNames.size} place surfaces`);
console.log(`Person packs analyzed: ${ZH_PERSON_PACKS.join(', ')}`);
console.log(`Total Wikidata zh-hant persons: ${totalPersons.toLocaleString()}\n`);

console.log('--- Two-character primaryName ---');
console.log(`Count: ${twoCharPrimary.toLocaleString()} (${pct(twoCharPrimary, totalPersons)} of persons)`);
console.log('Tag breakdown (non-exclusive):');
for (const [tag, count] of [...tagCounts.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${tag}: ${count.toLocaleString()} (${pct(count, twoCharPrimary)} of 2-char primaries)`);
}
console.log('\nTop recurring 2-char primaries:');
for (const [name, count] of topTwoChar) {
  const tags = classifyTwoChar(name).join(',');
  console.log(`  ${name}: ${count} [${tags}]`);
}

console.log('\n--- Office-exact primaryName (any length) ---');
console.log(`Count: ${officeExactPrimary.toLocaleString()} (${pct(officeExactPrimary, totalPersons)} of persons)`);
console.log('Sample:');
for (const ex of officeExactExamples.slice(0, 15)) {
  console.log(`  ${ex.primaryName} (${ex.authorityId}, ${ex.pack}) — ${ex.description ?? ''}`);
}

console.log('\n--- Two-char alias on longer primary (searchStrings leak) ---');
console.log(`Count: ${twoCharAliasOnLongPrimary.toLocaleString()} alias rows`);
for (const ex of aliasLeakExamples.slice(0, 12)) {
  console.log(`  ${ex.primaryName} → alias "${ex.alias}" [${ex.tags.join(',')}] (${ex.authorityId})`);
}

console.log('\n--- Flagged 2-char primaries (office/place/era-like) — sample ---');
for (const ex of flaggedExamples.slice(0, 20)) {
  console.log(`  ${ex.primaryName} [${ex.tags.join(',')}] ${ex.authorityId} (${ex.pack})`);
}

console.log('\n--- DILA comparison ---');
console.log(`DILA persons: ${dilaPersons.length.toLocaleString()}`);
console.log(`2-char primaryName: ${dilaTwoChar.toLocaleString()} (${pct(dilaTwoChar, dilaPersons.length)})`);
console.log(`Office-exact primaryName: ${dilaOfficeExact.toLocaleString()} (${pct(dilaOfficeExact, dilaPersons.length)})`);
