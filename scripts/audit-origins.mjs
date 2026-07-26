#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { readNdjson } from '../shared/ndjson.mjs';
import { resolveOriginGroups, writeOriginReview } from '../shared/originResolve.mjs';

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

const cbdbDir = arg('--cbdb');
const norbertDir = arg('--norbert');
const dilaDir = arg('--dila');
const concordancePath = arg('--concordance');
const outPath = arg('--out', '/tmp/origin-review.ndjson');
const summaryPath = arg('--summary', `${outPath}.summary.json`);
const radiusKm = Number(arg('--radius-km', '5'));

if (!cbdbDir || !norbertDir || !dilaDir) {
  throw new Error('Usage: node scripts/audit-origins.mjs --cbdb DIR --norbert DIR --dila DIR [--concordance FILE] [--out FILE]');
}

const readPeople = (dir) => readNdjson(path.join(dir, 'persons.ndjson'));
const peopleBySource = {
  CBDB: readPeople(cbdbDir),
  Norbert: readPeople(norbertDir),
  DILA: readPeople(dilaDir),
};

const dilaPlaces = new Map(readNdjson(path.join(dilaDir, 'places.ndjson'))
  .map((place) => [String(place.authorityId), place]));
for (const person of peopleBySource.DILA) {
  for (const origin of person.metadata?.origin ?? []) {
    const geo = dilaPlaces.get(String(origin.placeAuthorityId))?.metadata?.geo;
    if (geo && !origin.geo) origin.geo = geo;
  }
}

const links = [];
if (concordancePath && fs.existsSync(concordancePath)) {
  for (const row of readNdjson(concordancePath)) {
    const norbert = row.metadata?.norbert;
    const matched = row.metadata?.matched;
    if (norbert?.authorityId && matched?.authorityId && matched?.source) {
      links.push({
        source: 'Norbert',
        authorityId: String(norbert.authorityId),
        targetSource: String(matched.source),
        targetAuthorityId: String(matched.authorityId),
      });
    }
  }
}

const groups = resolveOriginGroups(peopleBySource, links, { radiusKm });
writeOriginReview(outPath, groups);
const decisions = Object.fromEntries([...new Set(groups.map((group) => group.decision))]
  .map((decision) => [decision, groups.filter((group) => group.decision === decision).length]));
const types = Object.fromEntries([...new Set(groups.map((group) => group.originType))]
  .map((type) => [type, groups.filter((group) => group.originType === type).length]));
const conflictReasons = Object.fromEntries([...new Set(groups.flatMap((group) => group.conflictReasons))]
  .map((reason) => [reason, groups.filter((group) => group.conflictReasons.includes(reason)).length]));
const summary = {
  groups: groups.length,
  links: links.length,
  radiusKm,
  decisions,
  conflictReasons,
  originTypes: types,
};
fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({ outPath, summaryPath, ...summary }));
