#!/usr/bin/env node
/**
 * Export the private Norbert dump as a standalone Grognard entities.xml.
 *
 * This is deliberately an export, not an in-place merge: the generated file
 * uses deterministic Norbert ids and keeps source ids on every imported value.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadNorbertTables } from './parseSqlDump.mjs';
import { compileNorbertPersons } from './compileRecords.mjs';
import { compileNorbertOffices } from './compileOffices.mjs';
import { compileNorbertPersonWrappers } from './personWrappers.mjs';
import {
  buildNorbertConcordance,
  concordanceIdnosByNorbertId,
  loadWikidataZhHantPersons,
  uniqueConcordanceRows,
} from './concordance.mjs';
import { readNdjson, writeNdjson } from '../shared/ndjson.mjs';
import { bareNorbertAuthorityValue, formatNorbertAuthorityValue } from './norbertAuthorityId.mjs';
import { extractDynastyLabelsFromSql } from './sanitizeDump.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const defaultSql = '/Users/daniel/ShareDocs/@Home/norbert_PRIVATE.sql';
const defaultOut = path.resolve(root, '../outputs/import_test/entities.xml');
const defaultPacks = path.join(root, 'packs');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const text = (name, value, attrs = '') => value == null || String(value).trim() === ''
  ? '' : `<${name}${attrs}>${esc(String(value).trim())}</${name}>`;
const empty = (name, attrs = '') => `<${name}${attrs}/>`;
const attr = (name, value) => value == null || String(value).trim() === '' ? '' : ` ${name}="${esc(value)}"`;
function provenance(origin = 'authority', source = 'NORBERT') {
  return ` origin="${origin}" source="${esc(source)}"`;
}

const IDNO_TYPE_BY_SOURCE = {
  cbdb: 'CBDB',
  wikidata: 'Wikidata',
  dila: 'DILA',
};

function appointmentRows(rows, offices) {
  const byName = new Map();
  for (const office of offices) {
    const list = byName.get(office.primaryName) ?? [];
    list.push(office);
    byName.set(office.primaryName, list);
  }
  const byPerson = new Map();
  for (const row of rows) {
    const personId = row[7];
    const officeName = row[5] == null ? '' : String(row[5]).trim();
    if (personId == null || !officeName) continue;
    const matches = byName.get(officeName) ?? [];
    const office = matches.length === 1 ? matches[0] : undefined;
    const barePersonId = bareNorbertAuthorityValue(personId);
    const item = {
      id: String(row[0]),
      personId: barePersonId,
      officeName,
      officeId: office?.authorityId,
      sourceRef: row[37] == null ? undefined : String(row[37]).trim(),
      appointmentType: row[2] == null ? undefined : String(row[2]).trim(),
    };
    const list = byPerson.get(barePersonId) ?? [];
    list.push(item);
    byPerson.set(barePersonId, list);
  }
  return byPerson;
}

function titleRows(rows) {
  const byPerson = new Map();
  for (const row of rows) {
    const personId = row[1];
    if (personId == null) continue;
    const title = {
      id: String(row[0]), dynasty: row[2], fief: row[3], posthumous: row[4],
      rank: row[6], temple: row[7], placeId: row[9], start: row[10], end: row[11],
    };
    if (![title.fief, title.posthumous, title.rank, title.temple].some((v) => v != null && String(v).trim())) continue;
    const barePersonId = bareNorbertAuthorityValue(personId);
    const list = byPerson.get(barePersonId) ?? [];
    list.push(title);
    byPerson.set(barePersonId, list);
  }
  return byPerson;
}

function externalIdnosXml(extraBySource = {}) {
  return Object.entries(extraBySource).map(([source, value]) => {
    const type = IDNO_TYPE_BY_SOURCE[source] ?? source.toUpperCase();
    return text('idno', value, ` type="${esc(type)}"${provenance('authority', type)}`);
  }).join('');
}

function personXml(person, appointments, titles, extraIdnos = {}) {
  const id = `person-norbert-${person.authorityId}`;
  const names = (person.names ?? []).filter((name) => name.text !== person.primaryName).map((name) =>
    text('persName', name.text, ` type="${esc(name.type ?? 'variant')}" xml:lang="zh-Hant"${provenance()}`),
  ).join('');
  const nationalities = (person.metadata?.nationality ?? []).map((n) =>
    text('nationality', n.label, ` ref="${esc(n.canonicalId)}"${provenance('authority', n.sourceIds?.[0] ?? 'NORBERT')}`),
  ).join('');
  const origins = (person.metadata?.origin ?? []).map((o) =>
    text('placeName', o.placeName, `${attr('type', o.originType)}${attr('sourceRef', o.sourceRef)}${provenance('authority', o.source ?? 'NORBERT')}`),
  ).join('');
  const description = text('note', person.metadata?.sourceDescription, ` type="description"${provenance()}`);
  const affiliationValues = appointments.map((a) =>
    text('affiliation', a.officeName, `${a.officeId ? ` ref="#office-norbert-${esc(a.officeId)}"` : ''}${attr('sourceRef', a.sourceRef)}${provenance()}`),
  ).join('');
  const cache = appointments.length ? text('note', JSON.stringify({ source: 'NORBERT', appointments }), ` type="authority-cache"${provenance()}`) : '';
  const noble = titles.map((t) => {
    const attrs = `${attr('dynasty', t.dynasty)} ref="NORBERT:person_nt:${esc(t.id)}"${provenance()}`;
    return `<nobleTitle${attrs}>${text('placeName', t.fief, provenance())}${text('roleName', t.rank, provenance())}${text('persName', t.posthumous, ` type="posthumous"${provenance()}`)}${text('persName', t.temple, ` type="temple"${provenance()}`)}</nobleTitle>`;
  }).join('');
  // Namespace the numeric Norbert person id so it cannot collide with office ids
  // that reuse the same integers (`person-12` / `office-12`).
  return `<person xml:id="${id}" type="person">${text('persName', person.primaryName, ` type="primary" xml:lang="zh-Hant"${provenance()}`)}${names}${text('idno', formatNorbertAuthorityValue('person', person.authorityId), ` type="NORBERT"${provenance()}`)}${externalIdnosXml(extraIdnos)}${description}${nationalities}${origins}${affiliationValues}${cache}${noble}${text('note', new Date().toISOString(), ' type="grognard-changed"')}</person>`;
}

function officeXml(office) {
  const id = `office-norbert-${office.authorityId}`;
  return `<org xml:id="${id}" type="office">${text('orgName', office.primaryName, ` type="primary" xml:lang="zh-Hant"${provenance()}`)}${text('idno', formatNorbertAuthorityValue('office', office.authorityId), ` type="NORBERT"${provenance()}`)}${text('note', office.metadata?.description, ` type="description"${provenance()}`)}${empty('state', ` type="norbert-office" ref="${esc(office.metadata?.entityId ?? office.authorityId)}"`)}${text('note', new Date().toISOString(), ' type="grognard-changed"')}</org>`;
}

function loadConcordanceSources(packsRoot) {
  /** @type {Record<string, any[]>} */
  const sources = {};
  const cbdbPath = path.join(packsRoot, 'cbdb', 'persons.ndjson');
  if (fs.existsSync(cbdbPath)) sources.cbdb = readNdjson(cbdbPath);
  const wikidata = loadWikidataZhHantPersons(path.join(packsRoot, 'wikidata'));
  if (wikidata.length) sources.wikidata = wikidata;
  return sources;
}

/**
 * @param {{
 *   sqlPath?: string;
 *   outputPath?: string;
 *   packsRoot?: string;
 *   concordancePath?: string | null;
 *   skipConcordance?: boolean;
 * }} [options]
 */
export async function exportNorbertEntities({
  sqlPath = defaultSql,
  outputPath = defaultOut,
  packsRoot = defaultPacks,
  concordancePath = null,
  skipConcordance = false,
} = {}) {
  if (!fs.existsSync(sqlPath)) {
    throw new Error(`Norbert SQL dump not found: ${sqlPath}`);
  }
  const tables = await loadNorbertTables(sqlPath, [
    'person', 'person_names', 'nat_raw', 'person_dynasties', 'person_origin',
    'office', 'officeholding_raw', 'person_nt',
  ]);
  const sidecar = path.join(path.dirname(sqlPath), 'dynasty-labels.json');
  const dynastyLabels = fs.existsSync(sidecar)
    ? (JSON.parse(fs.readFileSync(sidecar, 'utf8')).dynasties ?? {})
    : extractDynastyLabelsFromSql(fs.readFileSync(sqlPath, 'utf8'));
  const persons = compileNorbertPersons(
    tables.person, tables.person_names, dynastyLabels,
    tables.person_dynasties, tables.nat_raw, tables.person_origin,
  );
  const offices = compileNorbertOffices(tables.office);
  const appointments = appointmentRows(tables.officeholding_raw, offices);
  const titles = titleRows(tables.person_nt);
  const peopleById = new Map();
  for (const p of persons) {
    const bare = bareNorbertAuthorityValue(p.authorityId);
    peopleById.set(bare, p);
    peopleById.set(String(p.authorityId), p);
  }
  const wrapperCount = compileNorbertPersonWrappers(tables.person_nt, peopleById).length;

  let concordanceRows = [];
  /** @type {Map<string, Record<string, string>>} */
  let idnosByPerson = new Map();
  const resolvedConcordancePath = concordancePath
    ?? path.join(path.dirname(outputPath), 'norbert-concordance.ndjson');
  if (!skipConcordance) {
    const sources = loadConcordanceSources(packsRoot);
    concordanceRows = buildNorbertConcordance(persons, sources);
    const uniqueRows = uniqueConcordanceRows(concordanceRows);
    idnosByPerson = concordanceIdnosByNorbertId(concordanceRows);
    fs.mkdirSync(path.dirname(resolvedConcordancePath), { recursive: true });
    writeNdjson(resolvedConcordancePath, concordanceRows);
    concordanceRows = uniqueRows;
  }

  const personXmls = persons.map((p) => {
    const bare = bareNorbertAuthorityValue(p.authorityId);
    return personXml(
      p,
      appointments.get(bare) ?? [],
      titles.get(bare) ?? [],
      idnosByPerson.get(String(p.authorityId)) ?? idnosByPerson.get(bare) ?? {},
    );
  }).join('');
  const officeXmls = offices.map(officeXml).join('');
  const databaseId = 'norbert-private-import-test';
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<TEI xmlns="http://www.tei-c.org/ns/1.0"><teiHeader><fileDesc><titleStmt><title>Norbert entity database</title></titleStmt><publicationStmt><p>Generated from the private Norbert SQL dump.</p><idno type="grognard-entity-database">${databaseId}</idno></publicationStmt><sourceDesc><p>Norbert authority data.</p></sourceDesc></fileDesc></teiHeader><standOff><listPerson>${personXmls}</listPerson><listPlace/><listOrg/><listOrg type="offices">${officeXmls}</listOrg><listBibl/></standOff></TEI>\n`;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, xml);

  const cbdbLinks = [...idnosByPerson.values()].filter((bag) => bag.cbdb).length;
  const wikidataLinks = [...idnosByPerson.values()].filter((bag) => bag.wikidata).length;
  return {
    outputPath,
    concordancePath: skipConcordance ? null : resolvedConcordancePath,
    persons: persons.length,
    offices: offices.length,
    appointments: [...appointments.values()].reduce((n, rows) => n + rows.length, 0),
    nobleTitles: [...titles.values()].reduce((n, rows) => n + rows.length, 0),
    wrapperRows: tables.person_nt.length,
    wrapperCandidates: wrapperCount,
    nationalities: persons.reduce((n, p) => n + (p.metadata?.nationality?.length ?? 0), 0),
    origins: persons.reduce((n, p) => n + (p.metadata?.origin?.length ?? 0), 0),
    concordanceMatches: concordanceRows.length,
    concordanceCbdb: cbdbLinks,
    concordanceWikidata: wikidataLinks,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  exportNorbertEntities({
    sqlPath: arg('--sql', defaultSql),
    outputPath: arg('--out', defaultOut),
    packsRoot: arg('--packs', defaultPacks),
    concordancePath: arg('--concordance', null),
    skipConcordance: process.argv.includes('--skip-concordance'),
  })
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => { console.error(error); process.exit(1); });
}
