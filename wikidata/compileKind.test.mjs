import test from 'node:test';
import assert from 'node:assert/strict';
import { kindCandidateFromRaw } from './compileKind.mjs';

const rawPlace = {
  qid: 'Q5581',
  primaryLabel: '竟陵',
  aliases: [],
  p31: [],
  crosswalk: { cbdb: '1234', chgis: '5678' },
};

test('kindCandidateFromRaw attaches crosswalk (incl. self wikidata id) for place kind', () => {
  const candidate = kindCandidateFromRaw(rawPlace, 'place', { languageId: 'zh-hant' });
  assert.deepEqual(candidate?.metadata?.crosswalk, {
    cbdb: '1234',
    chgis: '5678',
    wikidata: ['5581'],
  });
});

test('kindCandidateFromRaw omits disabled crosswalk keys but keeps the rest', () => {
  const candidate = kindCandidateFromRaw(rawPlace, 'place', {
    languageId: 'zh-hant',
    disableCrosswalkKeys: ['chgis'],
  });
  assert.deepEqual(candidate?.metadata?.crosswalk, {
    cbdb: '1234',
    wikidata: ['5581'],
  });
});

test('kindCandidateFromRaw with all keys disabled still keeps self wikidata id unless also disabled', () => {
  const candidate = kindCandidateFromRaw(rawPlace, 'place', {
    languageId: 'zh-hant',
    disableCrosswalkKeys: ['cbdb', 'chgis', 'wikidata'],
  });
  assert.equal(candidate?.metadata?.crosswalk, undefined);
});
