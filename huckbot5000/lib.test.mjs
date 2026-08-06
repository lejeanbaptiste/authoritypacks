import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { detectCollision, indexHuckerByHeadword, contentWords, readCbdbHuckerPairs, detectTransliterationPunt } from './lib.mjs';

function index(pairs) {
  return indexHuckerByHeadword(pairs);
}

test('detectCollision: no Hucker entry for headword passes', () => {
  const result = detectCollision('司天監', 'Directorate of Astronomy', index([]));
  assert.equal(result.flag, 'none');
});

test('detectCollision: exact match on Hucker gloss is a collision', () => {
  const huckerByHeadword = index([{ zh: '博士', en: 'Erudite', dynasty: null }]);
  const result = detectCollision('博士', 'Erudite', huckerByHeadword);
  assert.equal(result.flag, 'exact');
});

test('detectCollision: case/punctuation-insensitive exact match is still a collision', () => {
  const huckerByHeadword = index([{ zh: '博士', en: 'Erudite', dynasty: null }]);
  const result = detectCollision('博士', 'erudite.', huckerByHeadword);
  assert.equal(result.flag, 'exact');
});

test('detectCollision: near-verbatim (high string similarity) is a collision', () => {
  const huckerByHeadword = index([
    { zh: '郞中令', en: 'Chamberlain for Attendants', dynasty: null },
  ]);
  const result = detectCollision('郞中令', 'Chamberlain of Attendants', huckerByHeadword);
  assert.equal(result.flag, 'near-verbatim');
});

test('detectCollision: identical content words in different order is a collision', () => {
  const huckerByHeadword = index([
    { zh: '尚書省', en: 'Department of State Affairs', dynasty: null },
  ]);
  const result = detectCollision('尚書省', 'State Affairs Department', huckerByHeadword);
  assert.equal(result.flag, 'near-verbatim');
});

test('detectCollision: a genuinely different gloss for the same headword passes', () => {
  const huckerByHeadword = index([
    { zh: '催欠司', en: 'Comptroller', dynasty: null },
  ]);
  const result = detectCollision('催欠司', 'Debt Collection Office', huckerByHeadword);
  assert.equal(result.flag, 'none');
});

test('detectCollision: a different headword\'s Hucker entry does not collide', () => {
  const huckerByHeadword = index([
    { zh: '博士', en: 'Erudite', dynasty: null },
  ]);
  const result = detectCollision('鹽', 'Salt', huckerByHeadword);
  assert.equal(result.flag, 'none');
});

test('detectCollision: Hucker\'s stock hedge phrase is a stylistic collision even with no headword match', () => {
  const result = detectCollision('脫脫禾孫', 'Meaning and derivation not clear', index([]));
  assert.equal(result.flag, 'stylistic');
});

test('detectCollision: hedge phrase check is case-insensitive', () => {
  const result = detectCollision('脫脫禾孫', 'meaning not clear, unofficial reference', index([]));
  assert.equal(result.flag, 'stylistic');
});

test('detectCollision: polysemous headword only collides against a matching sense', () => {
  const huckerByHeadword = index([
    { zh: '內大', en: 'Grand Minister of the Imperial Household Department', dynasty: 'CH\'ING' },
  ]);
  const passes = detectCollision('內大', 'Grand Minister Assistant Commander of the Imperial Guard', huckerByHeadword);
  assert.equal(passes.flag, 'none');
  const collides = detectCollision('內大', 'Grand Minister of the Imperial Household Department', huckerByHeadword);
  assert.equal(collides.flag, 'exact');
});

test('detectCollision: candidate content words wholly contained in a noisy Hucker gloss collide', () => {
  const huckerByHeadword = index([
    { zh: '博士', en: 'Erudite van official of special', dynasty: null },
  ]);
  const result = detectCollision('博士', 'Erudite', huckerByHeadword);
  assert.equal(result.flag, 'near-verbatim');
});

test('detectCollision: unrelated single short word does not collide', () => {
  const huckerByHeadword = index([
    { zh: '鹽', en: 'Salt Monopoly Office', dynasty: null },
  ]);
  const result = detectCollision('鹽', 'Tax', huckerByHeadword);
  assert.equal(result.flag, 'none');
});

test('contentWords strips stopwords and lowercases', () => {
  assert.deepEqual(contentWords('Director of the Pasturage'), ['director', 'pasturage']);
});

test('readCbdbHuckerPairs reads only (Hucker)-tagged rows and strips the citation', async () => {
  const dbPath = path.join(os.tmpdir(), `hb5000-cbdb-test-${process.pid}-${Date.now()}.sqlite3`);
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE OFFICE_CODES (
      c_office_id INTEGER,
      c_office_chn TEXT,
      c_office_trans TEXT,
      c_office_trans_alt TEXT
    );
  `);
  db.prepare('INSERT INTO OFFICE_CODES VALUES (?, ?, ?, ?)').run(
    1, '提舉', 'Supervisor (Hucker)', null,
  );
  db.prepare('INSERT INTO OFFICE_CODES VALUES (?, ?, ?, ?)').run(
    2, '知縣', 'District Magistrate', null, // no Hucker tag -- should be excluded
  );
  db.prepare('INSERT INTO OFFICE_CODES VALUES (?, ?, ?, ?)').run(
    3, '都水監主簿', null, 'Recorder of the Directorate of Waterways (Hucker)',
  );
  db.close();

  try {
    const pairs = await readCbdbHuckerPairs(dbPath);
    assert.equal(pairs.length, 2);
    const byZh = indexHuckerByHeadword(pairs);
    assert.equal(byZh.get('提舉')[0].en, 'Supervisor');
    assert.equal(byZh.get('都水監主簿')[0].en, 'Recorder of the Directorate of Waterways');
    assert.equal(byZh.has('知縣'), false);
  } finally {
    fs.unlinkSync(dbPath);
  }
});

test('detectTransliterationPunt catches pinyin + generic Office', () => {
  const result = detectTransliterationPunt('平隼案', 'Pingshun Office', {
    romanize: () => 'pingshun',
  });
  assert.equal(result.flag, 'transliteration');
});

test('detectTransliterationPunt allows real translations', () => {
  const result = detectTransliterationPunt('平隼案', 'Bureau of Falconry Cases', {
    romanize: () => 'pingshun',
  });
  assert.equal(result.flag, 'none');
});

test('detectTransliterationPunt works with live pinyin-pro', () => {
  const result = detectTransliterationPunt('平隼案', 'Pingshunan Office');
  assert.equal(result.flag, 'transliteration');
});
