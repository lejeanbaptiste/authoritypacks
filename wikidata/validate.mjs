#!/usr/bin/env node
/**
 * Validate W0 reference tables for Wikidata pack builds.
 * Usage: npm run validate
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const readJson = (name) => {
  const file = path.join(__dirname, name);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { name, data };
};

const errors = [];
const warn = (msg) => errors.push(`WARN: ${msg}`);
const fail = (msg) => errors.push(`FAIL: ${msg}`);

const qidRe = /^Q\d+$/;

const { data: dynastiesDoc } = readJson('dynasties.json');
const { data: kindsDoc } = readJson('kind-queries.json');
const { data: languagesDoc } = readJson('languages.json');
const { data: identifiersDoc } = readJson('identifierProperties.json');

// --- dynasties ---
const dynastyIds = new Set();
const dynastyQids = new Set();
for (const d of dynastiesDoc.dynasties) {
  for (const field of ['id', 'packSlug', 'qid', 'labelZh', 'labelEn', 'startYear', 'endYear']) {
    if (d[field] === undefined || d[field] === '') fail(`dynasties.json: ${d.id ?? '?'} missing ${field}`);
  }
  if (!qidRe.test(d.qid)) fail(`dynasties.json: ${d.id} invalid qid ${d.qid}`);
  if (d.startYear > d.endYear) fail(`dynasties.json: ${d.id} startYear > endYear`);
  if (dynastyIds.has(d.id)) fail(`dynasties.json: duplicate id ${d.id}`);
  if (dynastyQids.has(d.qid)) warn(`dynasties.json: duplicate qid ${d.qid} (${d.id})`);
  dynastyIds.add(d.id);
  dynastyQids.add(d.qid);
  if (d.qid === dynastiesDoc.chinaRegionQid) {
    fail(`dynasties.json: ${d.id} uses China region Qid — use dynasty/sovereign items only`);
  }
}

// --- kind-queries ---
const requiredKinds = ['person', 'place', 'org', 'work'];
for (const kind of requiredKinds) {
  const entry = kindsDoc.kinds[kind];
  if (!entry) fail(`kind-queries.json: missing kind ${kind}`);
  else {
    if (!Array.isArray(entry.instanceOf) || entry.instanceOf.length === 0) {
      fail(`kind-queries.json: ${kind} has empty instanceOf`);
    }
    for (const q of entry.instanceOf) {
      if (!qidRe.test(q)) fail(`kind-queries.json: ${kind} invalid instanceOf ${q}`);
    }
  }
}

// --- languages ---
const packLangIds = new Set();
for (const lang of languagesDoc.packLanguages) {
  for (const field of ['id', 'label', 'ljbProjectCodes', 'wikidataLabelLanguages']) {
    if (!lang[field] || (Array.isArray(lang[field]) && lang[field].length === 0)) {
      fail(`languages.json: ${lang.id ?? '?'} missing ${field}`);
    }
  }
  if (packLangIds.has(lang.id)) fail(`languages.json: duplicate id ${lang.id}`);
  packLangIds.add(lang.id);
}

if (!packLangIds.has('zh-hant') || !packLangIds.has('zh-hans')) {
  fail('languages.json: must include zh-hant and zh-hans pack languages');
}

const identifierKeys = new Set();
for (const prop of identifiersDoc.properties ?? []) {
  for (const field of ['property', 'key', 'label', 'cardinality']) {
    if (!prop[field]) fail(`identifierProperties.json: missing ${field} on ${prop.property ?? '?'}`);
  }
  if (!/^P\d+$/.test(prop.property)) {
    fail(`identifierProperties.json: invalid property ${prop.property}`);
  }
  identifierKeys.add(prop.key);
}
if (!identifierKeys.has('cbdb') || !identifierKeys.has('viaf')) {
  fail('identifierProperties.json: must include cbdb and viaf crosswalk keys');
}

const closureFile = path.join(__dirname, 'kind-instance-closure.json');
if (fs.existsSync(closureFile)) {
  const closureDoc = JSON.parse(fs.readFileSync(closureFile, 'utf8'));
  for (const kind of requiredKinds) {
    const entry = closureDoc.kinds?.[kind];
    if (!entry?.instanceOfClosure?.length) {
      warn(`kind-instance-closure.json: missing closure for ${kind}`);
      continue;
    }
    for (const root of kindsDoc.kinds[kind].instanceOf) {
      if (!entry.instanceOfClosure.includes(root)) {
        fail(`kind-instance-closure.json: ${kind} closure missing root ${root}`);
      }
    }
  }
} else {
  warn('kind-instance-closure.json: not found — dump extract uses direct P31 only until npm run wikidata:build-closure');
}

const fails = errors.filter((e) => e.startsWith('FAIL:'));
const warns = errors.filter((e) => e.startsWith('WARN:'));

console.log(`Wikidata pack build — W0 validation`);
console.log(`  dynasties: ${dynastiesDoc.dynasties.length} entries`);
console.log(`  kinds: ${requiredKinds.join(', ')}`);
console.log(`  pack languages: ${languagesDoc.packLanguages.length}`);
console.log(`  identifier properties: ${identifiersDoc.properties.length}`);

if (warns.length) {
  console.log('\nWarnings:');
  for (const w of warns) console.log(`  ${w}`);
}

if (fails.length) {
  console.error('\nErrors:');
  for (const f of fails) console.error(`  ${f}`);
  process.exit(1);
}

console.log('\nOK — W0 tables valid.');
