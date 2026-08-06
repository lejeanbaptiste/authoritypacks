import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessFrenchCandidate,
  batchAKey,
  batchBKey,
  buildFrenchRetrievalIndex,
  cleanEnglishGloss,
  cleanFrenchGloss,
  cleanRotoursSnippet,
  extractRotoursFromFull,
  frenchContentWords,
  mineFrenchLexicon,
  renderBatchAPrompt,
  renderBatchBPrompt,
} from './lib.mjs';

test('extractRotoursFromFull finds RR citations', () => {
  const full =
    'Eunuch Attendant upon the female Chief; status rank 7. RR: grand eunuque.';
  assert.deepEqual(extractRotoursFromFull(full), ['grand eunuque']);
});

test('cleanRotoursSnippet fixes OCR I\' / V confusions', () => {
  assert.equal(cleanRotoursSnippet("directeur des rites de I'abstinence"), "directeur des rites de l'abstinence");
  assert.equal(cleanRotoursSnippet('service du directeur des rites de Vabstinence'), "service du directeur des rites de l'abstinence");
});

test('cleanEnglishGloss rejects placeholders', () => {
  assert.equal(cleanEnglishGloss('[Not Yet Translated]'), '');
  assert.equal(cleanEnglishGloss('Erudite (Hucker)'), 'Erudite');
});

test('cleanEnglishGloss rejects numeric / CJK / punctuation "English"', () => {
  assert.equal(cleanEnglishGloss('8947'), '');
  assert.equal(cleanEnglishGloss('//'), '');
  assert.equal(cleanEnglishGloss('統稱'), '');
  assert.equal(cleanEnglishGloss('General of the Basimu部'), '');
});

test('assessFrenchCandidate drops CJK-in-French and bad English', () => {
  assert.equal(
    assessFrenchCandidate({ en: '8947', fr: 'grand maître' }).ok,
    false,
  );
  assert.equal(
    assessFrenchCandidate({ en: 'Palace Guard Officer', fr: 'officier de la garde du palais' }).ok,
    true,
  );
  assert.equal(
    assessFrenchCandidate({ en: 'General', fr: 'général du Basimu部' }).ok,
    false,
  );
});

test('cleanFrenchGloss strips labels', () => {
  assert.equal(cleanFrenchGloss('Traduction française : Érudit'), 'Érudit');
});

test('keys are stable', () => {
  assert.equal(batchAKey('博士', 'HAN', 'Erudite (Hucker)'), batchAKey('博士', 'HAN', 'Erudite'));
  assert.equal(batchBKey('博士', 'Erudite (Hucker)'), batchBKey('博士', 'Erudite'));
});

test('frenchContentWords drops stopwords and accents for matching', () => {
  const words = frenchContentWords('Directeur de l\'astronomie');
  assert.ok(words.includes('directeur'));
  assert.ok(words.includes('astronomie'));
  assert.ok(!words.includes('de'));
});

test('mineFrenchLexicon + retrieval find related titles', () => {
  const pairs = [
    { zh: '司天監', en: 'Directorate of Astronomy', fr: 'Direction de l\'astronomie', dynasty: 'T\'ANG' },
    { zh: '司天臺', en: 'Astronomical Observatory', fr: 'Observatoire astronomique', dynasty: 'T\'ANG' },
    { zh: '太史令', en: 'Grand Astrologer', fr: 'Grand astrologue', dynasty: 'HAN' },
    { zh: '博士', en: 'Erudite', fr: 'Érudit', dynasty: 'HAN' },
    { zh: '國子博士', en: 'Erudite of the National University', fr: 'Érudit de l\'Université nationale', dynasty: 'T\'ANG' },
    { zh: '太學博士', en: 'Erudite of the National University', fr: 'Érudit de l\'Université', dynasty: 'HAN' },
    { zh: '五經博士', en: 'Erudite of the Five Classics', fr: 'Érudit des Cinq classiques', dynasty: 'HAN' },
    { zh: '尚書', en: 'Minister', fr: 'Ministre', dynasty: 'HAN' },
    { zh: '尚書令', en: 'Director of the Imperial Secretariat', fr: 'Directeur du secrétariat impérial', dynasty: 'HAN' },
    { zh: '侍郎', en: 'Vice Minister', fr: 'Vice-ministre', dynasty: 'T\'ANG' },
  ];
  // Lower thresholds so the tiny fixture still mines something.
  const lexicon = mineFrenchLexicon(pairs, { minSupport: 2, minP: 0.2, minLift: 1 });
  assert.ok(lexicon.size >= 1);
  const retrieval = buildFrenchRetrievalIndex(pairs);
  const hits = retrieval.retrieve('司天監');
  assert.ok(hits.some((h) => h.zh === '司天臺' || h.zh === '司天監'));
});

test('renderBatchAPrompt includes full definition and RR', () => {
  const prompt = renderBatchAPrompt(
    {
      zh: '阿監',
      en: 'Eunuch Attendant',
      full: '… RR: grand eunuque.',
      dynasty: 'T\'ANG',
      rotours: ['grand eunuque'],
    },
    { rotoursSeeds: [{ zh: '察院', fr: 'cour des enquêtes', en: 'Investigation Bureau' }] },
  );
  assert.match(prompt, /阿監/);
  assert.match(prompt, /grand eunuque/);
  assert.match(prompt, /Définition anglaise/);
});

test('renderBatchBPrompt includes lexicon and exemplars', () => {
  const pairs = [
    { zh: '博士', en: 'Erudite', fr: 'Érudit', dynasty: 'HAN' },
    { zh: '太學博士', en: 'Erudite of the National University', fr: 'Érudit de l\'Université', dynasty: 'HAN' },
  ];
  const lexicon = mineFrenchLexicon(pairs, { minSupport: 1, minP: 0.1, minLift: 0.5 });
  const retrieval = buildFrenchRetrievalIndex(pairs);
  const prompt = renderBatchBPrompt(
    { zh: '國子博士', en: 'Erudite of the Directorate of Education', dynasty: 'T\'ANG' },
    retrieval,
    lexicon,
    { rotoursSeeds: [] },
  );
  assert.match(prompt, /國子博士/);
  assert.match(prompt, /Glose anglaise/);
});
