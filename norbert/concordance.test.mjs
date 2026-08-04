import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNorbertConcordance,
  concordanceIdnosByNorbertId,
  runNorbertPersonConcordance,
  uniqueConcordanceRows,
} from './concordance.mjs';
import {
  dynastiesCompatible,
  isPreTangPerson,
  splitParentheticalPrimary,
  templeNameBag,
} from './concordanceHelpers.mjs';

const literati = (source, id, primary, style, dynasty, extra = {}) => ({
  source,
  authorityId: id,
  primaryName: primary,
  names: [
    { text: primary, type: 'primary' },
    { text: style, type: 'courtesy' },
    ...(extra.names ?? []),
  ],
  metadata: { dynasty, ...(extra.metadata ?? {}) },
});

test('tier 1A requires personal name, style name, and a compatible dynasty', () => {
  const rows = buildNorbertConcordance(
    [literati('Norbert', '1', '王安石', '介甫', '宋')],
    {
      cbdb: [
        literati('CBDB', '2', '王安石', '介甫', '宋'),
        literati('CBDB', '3', '王安石', '介甫', '唐'),
      ],
      dila: [literati('DILA', '4', '王安石', '介甫', undefined)],
    },
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].metadata.matched.source, 'cbdb');
  assert.equal(rows[0].metadata.matched.authorityId, '2');
  assert.equal(rows[0].metadata.match, 'tier1a-primary+style+dynasty');
});

test('tier 1A accepts any of several Norbert dynasties', () => {
  const norbert = [{
    source: 'Norbert',
    authorityId: '10',
    primaryName: '某人',
    names: [
      { text: '某人', type: 'primary' },
      { text: '某字', type: 'courtesy' },
    ],
    metadata: {
      dynasty: '東晉',
      dynasties: [
        { id: 'dynasty:1', label: '東晉' },
        { id: 'dynasty:2', label: '劉宋' },
      ],
    },
  }];
  const rows = buildNorbertConcordance(norbert, {
    cbdb: [literati('CBDB', '20', '某人', '某字', '劉宋')],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].metadata.matched.authorityId, '20');
});

test('ambiguous same-source hits are dropped from unique idno map', () => {
  const result = runNorbertPersonConcordance(
    [literati('Norbert', '1', '王安石', '介甫', '宋')],
    {
      cbdb: [
        literati('CBDB', '2', '王安石', '介甫', '宋'),
        literati('CBDB', '9', '王安石', '介甫', '宋'),
      ],
      wikidata: [literati('Wikidata', 'Q1', '王安石', '介甫', '宋')],
    },
    { includeTier2Review: false },
  );
  assert.equal(result.accepted.length, 1);
  assert.equal(result.accepted[0].metadata.matched.source, 'wikidata');
  assert.ok(result.review.some((row) => row.metadata.reason === 'ambiguous'));
  const idnos = concordanceIdnosByNorbertId(result.accepted);
  assert.deepEqual(idnos.get('1'), { wikidata: 'Q1' });
});

test('tier 1C matches emperor on family + dynasty + temple', () => {
  const norbert = [{
    source: 'Norbert',
    authorityId: '4115',
    primaryName: '李世民',
    names: [
      { text: '李世民', type: 'primary' },
      { text: '世民', type: 'given' },
    ],
    metadata: {
      dynasty: '唐',
      nobleTitles: [{
        dynasty: '唐',
        roleName: '帝',
        temple: '太宗',
        persName: '李世民',
      }],
    },
  }];
  const cbdb = [{
    source: 'CBDB',
    authorityId: '13060',
    primaryName: '李世民(唐太宗)',
    names: [
      { text: '太宗', type: 'temple' },
      { text: '文武大聖大廣孝皇帝', type: 'posthumous' },
    ],
    metadata: { dynasty: '唐' },
  }];
  const rows = buildNorbertConcordance(norbert, { cbdb }, { includeTier2Review: false });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].metadata.match, 'tier1c-ruler-temple');
  assert.equal(rows[0].metadata.matched.authorityId, '13060');
  assert.equal(rows[0].metadata.family, '李');
  assert.equal(rows[0].metadata.temple, '太宗');
});

test('tier 1C matches on posthumous with 西漢/漢 and 高皇帝/高 normalization', () => {
  const norbert = [{
    source: 'Norbert',
    authorityId: '3629',
    primaryName: '劉邦',
    names: [{ text: '劉邦', type: 'primary' }],
    metadata: {
      dynasty: '西漢',
      nobleTitles: [{
        dynasty: '漢',
        roleName: '帝',
        posthumousName: '高',
        temple: '高祖',
        persName: '劉邦',
      }],
    },
  }];
  const cbdb = [{
    source: 'CBDB',
    authorityId: '16622',
    primaryName: '劉邦',
    names: [
      { text: '高皇帝', type: 'posthumous' },
      { text: '太祖', type: 'temple' },
    ],
    metadata: { dynasty: '西漢' },
  }];
  const rows = buildNorbertConcordance(norbert, { cbdb }, { includeTier2Review: false });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].metadata.match, 'tier1c-ruler-posthumous');
  assert.equal(rows[0].metadata.matched.authorityId, '16622');
});

test('tier 1C can attach noble titles from person-wrappers', () => {
  const norbert = [{
    source: 'Norbert',
    authorityId: '4115',
    primaryName: '李世民',
    names: [{ text: '李世民', type: 'primary' }],
    metadata: { dynasty: '唐' },
  }];
  const wrappers = [{
    authorityId: 'noble-title:1',
    primaryName: '唐帝李世民',
    metadata: {
      wrapper: {
        personId: 'NORBERT:person:4115',
        components: {
          nationality: '唐',
          roleName: '帝',
          templeName: '太宗',
          persName: '李世民',
        },
      },
    },
  }];
  const cbdb = [{
    source: 'CBDB',
    authorityId: '13060',
    primaryName: '李世民(唐太宗)',
    names: [{ text: '太宗', type: 'temple' }],
    metadata: { dynasty: '唐' },
  }];
  const rows = buildNorbertConcordance(norbert, { cbdb }, {
    wrappers,
    includeTier2Review: false,
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].metadata.match, 'tier1c-ruler-temple');
});

test('tier 0 expands unique CBDB hits to DILA via idno', () => {
  const norbert = [literati('Norbert', '1', '王安石', '介甫', '宋')];
  const sources = {
    cbdb: [literati('CBDB', '2', '王安石', '介甫', '宋')],
    dila: [{
      source: 'DILA',
      authorityId: 'A1',
      primaryName: '王安石',
      names: [],
      metadata: { dynasty: '宋', crosswalk: { cbdb: '2' } },
    }],
  };
  const rows = buildNorbertConcordance(norbert, sources, { includeTier2Review: false });
  assert.equal(rows.length, 2);
  const bySource = Object.fromEntries(rows.map((r) => [r.metadata.matched.source, r.metadata.matched.authorityId]));
  assert.deepEqual(bySource, { cbdb: '2', dila: 'A1' });
});

test('helpers: parenthetical split and pre-Tang filter', () => {
  assert.deepEqual(splitParentheticalPrimary('李世民(唐太宗)'), {
    personal: '李世民',
    paren: '唐太宗',
  });
  assert.deepEqual(templeNameBag({
    primaryName: '李世民(唐太宗)',
    names: [{ text: '太宗', type: 'temple' }],
  }).sort(), ['太宗', '唐太宗'].sort());
  assert.equal(dynastiesCompatible('唐', '唐朝'), true);
  assert.equal(isPreTangPerson({ metadata: { dynasty: '隋' } }), true);
  assert.equal(isPreTangPerson({ metadata: { dynasty: '唐' } }), false);
  assert.equal(uniqueConcordanceRows([]).length, 0);
});
