#!/usr/bin/env node
/** Build exact Norbert person concordances against other authority packs. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readNdjson, writeNdjson } from '../shared/ndjson.mjs';
import { normalizeSurface } from '../shared/normalize.mjs';

const styleTypes = new Set(['courtesy', '字', 'style', 'styleName']);
const keyPart = (value) => normalizeSurface(String(value ?? '')).replace(/[·．。\s]/g, '');

export function personStyles(person) {
  const typed = (person.names ?? []).filter((n) => styleTypes.has(n.type));
  return [...new Set(typed.map((n) => keyPart(n.text)).filter(Boolean))];
}

function personKeys(person) {
  const primary = keyPart(person.primaryName);
  const dynasty = keyPart(person.metadata?.dynasty);
  return personStyles(person).map((style) => ({ primary, style, dynasty }));
}

/**
 * Return strict matches: primary name, style name, and dynasty must all agree.
 * DILA records without a structured style or dynasty therefore do not match.
 */
export function buildNorbertConcordance(norbert, sources) {
  const indexes = new Map();
  for (const [source, people] of Object.entries(sources)) {
    const index = new Map();
    for (const person of people) {
      for (const key of personKeys(person)) {
        if (!key.primary || !key.style || !key.dynasty) continue;
        const composite = `${key.primary}\u0000${key.style}\u0000${key.dynasty}`;
        const list = index.get(composite) ?? [];
        list.push({ person, key });
        index.set(composite, list);
      }
    }
    indexes.set(source, index);
  }

  return norbert.flatMap((person) => personKeys(person).flatMap((key) => {
    if (!key.primary || !key.style || !key.dynasty) return [];
    const composite = `${key.primary}\u0000${key.style}\u0000${key.dynasty}`;
    return [...indexes].flatMap(([source, index]) => (index.get(composite) ?? []).map(({ person: match }) => ({
      source: 'Norbert-concordance',
      authorityId: `Norbert:${person.authorityId}:${source}:${match.authorityId}`,
      kind: 'person',
      primaryName: person.primaryName,
      searchStrings: [person.primaryName],
      metadata: {
        match: 'primary+style+dynasty',
        styleName: match.names?.find((n) => keyPart(n.text) === key.style)?.text ?? key.style,
        dynasty: person.metadata.dynasty,
        norbert: { authorityId: person.authorityId, primaryName: person.primaryName },
        matched: { source, authorityId: match.authorityId, primaryName: match.primaryName },
      },
    })));
  }));
}

function arg(name, fallback) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] ?? fallback : fallback; }
function load(dir) { return readNdjson(path.join(dir, 'persons.ndjson')); }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const norbertDir = arg('--norbert');
  const out = arg('--out', 'packs/norbert/norbert-concordance.ndjson');
  if (!norbertDir) throw new Error('Usage: node norbert/concordance.mjs --norbert DIR [--cbdb DIR] [--dila DIR] [--wikidata DIR] [--out FILE]');
  const sources = {};
  for (const source of ['cbdb', 'dila', 'wikidata']) {
    const dir = arg(`--${source}`);
    if (!dir) continue;
    const file = path.join(dir, 'persons.ndjson');
    if (!fs.existsSync(file)) {
      console.warn(`Skipping ${source}: no persons.ndjson at ${file}`);
      continue;
    }
    sources[source] = load(dir);
  }
  const rows = buildNorbertConcordance(load(norbertDir), sources);
  writeNdjson(out, rows);
  console.log(`Norbert concordance: ${rows.length} matches → ${out}`);
}
