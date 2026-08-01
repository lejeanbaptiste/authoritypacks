#!/usr/bin/env node

/**
 * Repair the historical reconciliation bug that copied Norbert origins into
 * untyped person names. Only an untyped, language-less direct <persName> on a
 * person is changed, and only when its text is an exact match for that
 * person's Norbert metadata.origin value.
 *
 * Usage:
 *   node repairOriginNames.mjs input/entities.xml output/entities.xml
 */

import fs from 'node:fs';
import path from 'node:path';
import { DOMParser, XMLSerializer } from '../../leaf-writer/node_modules/@xmldom/xmldom/lib/index.js';

const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
  console.error('Usage: node repairOriginNames.mjs input/entities.xml output/entities.xml');
  process.exit(2);
}

const TEI_NS = 'http://www.tei-c.org/ns/1.0';
const packPath = path.resolve(import.meta.dirname, '../../authority extraction/packs/norbert/persons.ndjson');
const pack = new Map(
  fs
    .readFileSync(packPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const row = JSON.parse(line);
      return [String(row.authorityId), row.metadata?.origin ?? []];
    }),
);

const document = new DOMParser().parseFromString(fs.readFileSync(inputPath, 'utf8'), 'application/xml');
const persons = Array.from(document.getElementsByTagName('person'));
let removed = 0;
let converted = 0;
let skippedExistingOrigin = 0;
const examples = [];

for (const person of persons) {
  const norbertId = Array.from(person.childNodes).find(
    (child) =>
      child.nodeType === 1 &&
      child.localName === 'idno' &&
      String(child.getAttribute('type')).toUpperCase() === 'NORBERT',
  )?.textContent?.trim();
  if (!norbertId) continue;

  const originRows = pack.get(norbertId) ?? [];
  const originsByText = new Map();
  for (const origin of originRows) {
    const text = origin.placeName?.trim();
    if (!text) continue;
    const key = `${origin.originType ?? ''}\u001f${origin.sourceRef ?? ''}`;
    const rows = originsByText.get(text) ?? new Map();
    rows.set(key, origin);
    originsByText.set(text, rows);
  }
  if (!originsByText.size) continue;

  const directPlaceNames = new Set(
    Array.from(person.childNodes)
      .filter((child) => child.nodeType === 1 && child.localName === 'placeName')
      .map((child) => child.textContent?.trim())
      .filter(Boolean),
  );

  for (const name of Array.from(person.childNodes).filter(
    (child) =>
      child.nodeType === 1 &&
      child.localName === 'persName' &&
      !child.getAttribute('type') &&
      !child.getAttribute('xml:lang'),
  )) {
    const text = name.textContent?.trim();
    const matches = text ? originsByText.get(text) : undefined;
    if (!matches) continue;

    name.parentNode.removeChild(name);
    removed += 1;
    if (directPlaceNames.has(text)) {
      skippedExistingOrigin += 1;
      continue;
    }

    for (const origin of matches.values()) {
      const place = document.createElementNS(TEI_NS, 'placeName');
      if (origin.originType) place.setAttribute('type', origin.originType);
      if (origin.sourceRef) place.setAttribute('sourceRef', origin.sourceRef);
      place.setAttribute('origin', 'authority');
      place.setAttribute('source', 'NORBERT');
      place.textContent = text;
      person.appendChild(place);
      converted += 1;
    }
    if (examples.length < 10) examples.push({ norbertId, text, originsAdded: matches.size });
  }
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, new XMLSerializer().serializeToString(document));
console.log(JSON.stringify({ persons: persons.length, removed, converted, skippedExistingOrigin, examples }, null, 2));
