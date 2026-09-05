import test from 'node:test';
import assert from 'node:assert/strict';
import { compileNorbertPersonWrappers } from './personWrappers.mjs';

test('person wrapper compiler preserves separate noble-title components', () => {
  const people = new Map([
    ['7', {
      primaryName: '範',
      names: [{ text: '范', type: 'primary' }],
    }],
  ]);
  const [wrapper] = compileNorbertPersonWrappers(
    [[19, 7, '梁', '鄱陽', null, null, '王', null, null, 'place-4', 500, 520, 51]],
    people,
  );

  assert.equal(wrapper.authorityId, 'noble-title:19');
  assert.deepEqual(wrapper.searchStrings, ['梁鄱陽王范', '鄱陽王范']);
  assert.deepEqual(wrapper.metadata.wrapper.components, {
    nationality: '梁',
    fief: '鄱陽',
    roleName: '王',
    persName: '范',
  });
  assert.equal(wrapper.metadata.wrapper.fiefPlaceId, 'place-4');
  assert.equal(wrapper.metadata.wrapper.personId, 'person-7');
});

test('wrapper compiler skips titles without a person', () => {
  const wrappers = compileNorbertPersonWrappers(
    [[19, 7, '梁', '鄱陽', null, null, '王', null, null, null, null, null, 51]],
    new Map(),
  );
  assert.deepEqual(wrappers, []);
});

test('wrapper compiler emits the approved abbreviated title only when pn_abr is present', () => {
  const people = new Map([
    ['2', { primaryName: '司馬曜', names: [{ text: '司馬曜', type: 'primary' }] }],
  ]);
  const [wrapper] = compileNorbertPersonWrappers(
    [[806, 2, '晉', '晉', '孝武', '武', '帝', null, null, null, null, null, 53]],
    people,
  );

  assert.ok(wrapper.searchStrings.includes('晉孝武帝司馬曜'));
  assert.ok(wrapper.searchStrings.includes('晉武帝司馬曜'));
  assert.ok(wrapper.metadata.wrapper.components.posthumousNameAbbr === '武');
});

test('wrapper compiler emits given-name-only and surname+given-name forms as separate records', () => {
  const people = new Map([
    [
      '42',
      {
        primaryName: '劉休仁',
        names: [
          { text: '劉', type: 'family' },
          { text: '休仁', type: 'given' },
        ],
      },
    ],
  ]);
  const wrappers = compileNorbertPersonWrappers(
    [[19, 42, null, '建安', null, null, '王', null, null, null, null, null, null]],
    people,
  );

  assert.equal(wrappers.length, 2);
  const given = wrappers.find((w) => w.metadata.wrapper.components.persName === '休仁');
  const full = wrappers.find((w) => w.metadata.wrapper.components.persName === '劉休仁');

  assert.ok(given, 'expected a given-name-only wrapper record');
  assert.ok(full, 'expected a surname+given-name wrapper record');
  assert.ok(given.searchStrings.includes('建安王休仁'));
  assert.ok(full.searchStrings.includes('建安王劉休仁'));
  assert.notEqual(given.authorityId, full.authorityId);
});

test('wrapper compiler falls back to the coarser name when 姓/名 are not split out', () => {
  const people = new Map([['7', { primaryName: '范', names: [{ text: '范', type: 'primary' }] }]]);
  const wrappers = compileNorbertPersonWrappers(
    [[19, 7, '梁', '鄱陽', null, null, '王', null, null, null, null, null, 51]],
    people,
  );

  assert.equal(wrappers.length, 1);
  assert.equal(wrappers[0].authorityId, 'noble-title:19');
});

test('wrapper compiler emits bare 太子/皇太子 + given-name forms with no fief', () => {
  const people = new Map([
    ['9', { primaryName: '楊勇', names: [{ text: '楊', type: 'family' }, { text: '勇', type: 'given' }] }],
  ]);
  const wrappers = compileNorbertPersonWrappers(
    [[30, 9, '隋', null, null, null, '太子', null, null, null, null, null, null]],
    people,
  );

  const heir = wrappers.find((w) => w.authorityId === 'noble-title:30:heir:勇');
  assert.ok(heir, 'expected a bare 太子 + given-name record');
  assert.deepEqual(heir.searchStrings.sort(), ['太子勇', '皇太子勇'].sort());
  assert.equal(heir.metadata.wrapper.components.fief, undefined);
});

test('wrapper compiler emits 皇太后/皇太妃 + surname + 氏 forms', () => {
  const people = new Map([
    ['5', { primaryName: '常氏', names: [{ text: '常', type: 'family' }] }],
  ]);
  const wrappers = compileNorbertPersonWrappers(
    [[41, 5, '漢', null, null, null, '太后', null, null, null, null, null, null]],
    people,
  );

  const consort = wrappers.find((w) => w.authorityId === 'noble-title:41:consort:常');
  assert.ok(consort, 'expected a consort/dowager record');
  assert.deepEqual(consort.searchStrings, ['皇太后常氏']);
  assert.equal(consort.metadata.wrapper.components.persName, '常氏');
  assert.equal(consort.metadata.wrapper.components.fief, undefined);
});
