import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileBdrc } from './compile.mjs';
import { personFromRows, placeFromRows, cleanBoSurface } from './compileRecords.mjs';
import { readNdjson } from '../shared/ndjson.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureCsv = path.join(__dirname, 'fixtures/sample-names.csv');

test('cleanBoSurface strips terminal shad slash', () => {
  assert.equal(cleanBoSurface('ཀཿཐོག་དགོན།/'), 'ཀཿཐོག་དགོན།');
});

test('personFromRows — primary from PersonPrimaryName, titles not in searchStrings', () => {
  const rows = [
    { p: 'P37', n: 'ngag dbang blo bzang rgya mtsho/', nt: 'PersonPrimaryName', bo: 'ངག་དབང་བློ་བཟང་རྒྱ་མཚོ།' },
    { p: 'P37', n: "tA la'i bla ma 05 ngag dbang blo bzang rgya mtsho/", nt: 'PersonPrimaryTitle', bo: 'ཏཱ་ལའི་བླ་མ་ངག་དབང་བློ་བཟང་རྒྱ་མཚོ།' },
    { p: 'P37', n: 'rgyal dbang lnga pa/', nt: 'PersonTitle', bo: 'རྒྱལ་དབང་ལྔ་པ།' },
  ];
  const person = personFromRows('P37', rows);
  assert.ok(person);
  // primaryName keeps the BDRC headword form (terminal shad intact) …
  assert.equal(person.primaryName, 'ངག་དབང་བློ་བཟང་རྒྱ་མཚོ།');
  // … but searchStrings are cleaned for the matcher (no terminal shad).
  assert.ok(person.searchStrings.includes('ངག་དབང་བློ་བཟང་རྒྱ་མཚོ'));
  assert.equal(person.searchStrings.includes('ངག་དབང་བློ་བཟང་རྒྱ་མཚོ།'), false);
  assert.equal(person.searchStrings.includes('རྒྱལ་དབང་ལྔ་པ།'), false);
  assert.equal(person.searchStrings.includes('རྒྱལ་དབང་ལྔ་པ'), false);
  assert.ok(person.names?.some((n) => n.type === 'romanization' && n.lang === 'bo-x-ewts'));
  assert.equal(person.metadata?.crosswalk?.bdrc, 'P37');
  assert.equal(person.metadata?.sourceRef, 'http://purl.bdrc.io/resource/P37');
});

test('placeFromRows — all prefLabels become searchStrings', () => {
  const place = placeFromRows('G222', [
    { p: 'G222', n: 'po ta la/', nt: 'prefLabel', bo: 'པོ་ཏ་ལ།' },
    { p: 'G222', n: 'se ra smad/', nt: 'prefLabel', bo: 'སེ་ར་སྨད།' },
  ]);
  assert.ok(place);
  assert.equal(place.searchStrings.length, 2);
  assert.equal(place.kind, 'place');
});

test('compileBdrc fixture — writes private manifests', () => {
  const tmp = fs.mkdtempSync(path.join(__dirname, 'tmp-bdrc-'));
  const personsOnly = path.join(tmp, 'persons.csv');
  const placesOnly = path.join(tmp, 'places.csv');
  const lines = fs.readFileSync(fixtureCsv, 'utf8').trim().split('\n');
  fs.writeFileSync(personsOnly, `${lines[0]}\n${lines.slice(1, 4).join('\n')}\n`);
  fs.writeFileSync(placesOnly, `${lines[0]}\n${lines.slice(4).join('\n')}\n`);

  const outDir = path.join(tmp, 'packs');
  const result = compileBdrc({
    personsCsv: personsOnly,
    placesCsv: placesOnly,
    outRoot: outDir,
  });

  assert.equal(result.persons, 1);
  assert.equal(result.places, 2);

  const packManifest = JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf8'));
  assert.equal(packManifest.license, 'local-use-only-do-not-redistribute');
  assert.equal(packManifest.policy.redistribute, false);
  assert.equal(packManifest.files['persons.ndjson'].entityCount, 1);
  assert.equal(packManifest.files['places.ndjson'].entityCount, 2);

  const pluginManifest = JSON.parse(
    fs.readFileSync(path.join(outDir, 'plugin.manifest.json'), 'utf8'),
  );
  assert.equal(pluginManifest.id, 'bdrc-authority');
  assert.equal(pluginManifest.contributions.authorityPacks.length, 2);

  const persons = readNdjson(path.join(outDir, 'persons.ndjson'));
  assert.equal(persons[0]?.authorityId, 'P37');
  const places = readNdjson(path.join(outDir, 'places.ndjson'));
  assert.equal(places.length, 2);

  fs.rmSync(tmp, { recursive: true, force: true });
});
