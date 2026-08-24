import test from 'node:test';
import assert from 'node:assert/strict';
import { compileNorbertPersons } from './compileRecords.mjs';

test('Norbert person compilation preserves person_origin assertions', () => {
  const [person] = compileNorbertPersons(
    [[1, '王安石', 'Wang Anshi', null, null]],
    [],
    [],
    [],
    [],
    [[10, 1, '臨川', '郡', '本', '史料']],
  );

  assert.deepEqual(person.metadata.origin, [{
    source: 'Norbert',
    originType: 'jiguan',
    placeName: '臨川',
    placeType: '郡',
    qualification: '本',
    sourceRef: '史料',
  }]);
});

test('Norbert person compilation never exports dynasty ranges as person dates', () => {
  const [person] = compileNorbertPersons(
    [[1, '王安石', 'Wang Anshi', null, null]],
    [],
    [[7, '宋', 'Song', 960, 1279]],
    [[1, 960, null, 1279]],
    [[1, null, 1, 7, null, null, 7]],
  );

  assert.equal(person.metadata.startYear, undefined);
  assert.equal(person.metadata.endYear, undefined);
  // Labelled, not merely absent. Consumers decide what may become birth/death by
  // reading `dateSource`; leaving it unset made every one of those guards fail
  // open, which is how 劉宋 (420–479) ended up as a person's vitals downstream.
  assert.equal(person.metadata.dateSource, 'nationality');
  // The dynasty span is still carried for the date filter — just not as a lifespan.
  assert.equal(person.metadata.dynasties[0].startYear, 960);
  assert.equal(person.metadata.dynasties[0].endYear, 1279);
  assert.equal(person.metadata.description.includes('960'), false);
  assert.equal(person.metadata.description.includes('1279'), false);
});

test('Norbert person.description is preserved as sourceDescription for entity one-liners', () => {
  const [person] = compileNorbertPersons(
    [[1, '卜顯', null, '疇人', null]],
    [],
    [[1, '西晉', 'Western Jin', 265, 316]],
    [],
    [[1, null, 1, 1, null, null, 1]],
  );

  assert.equal(person.metadata.sourceDescription, '疇人');
  assert.match(person.metadata.description, /疇人/);
  assert.match(person.metadata.description, /卜顯/);
});

test('Norbert nationalities union person_dynasties with extra nat_raw court_id pairs', () => {
  const [person] = compileNorbertPersons(
    [[1, '王安石', null, null, null]],
    [],
    {
      7: { zh: '宋', en: 'Song', startYear: 960, endYear: 1279 },
      46: { zh: '漢', en: 'Han', startYear: -202, endYear: 220 },
    },
    [[1, 1, 7]],
    [[10, '漢人', 1, 46, null, null, 7]],
  );

  const labels = person.metadata.nationality.map((n) => n.label).sort();
  assert.deepEqual(labels, ['宋', '漢']);
  const han = person.metadata.nationality.find((n) => n.label === '漢');
  assert.equal(han.evidence, '漢人');
});

test('Norbert keeps an empress headword out of personal-name parsing and preserves its full title', () => {
  const [person] = compileNorbertPersons(
    [[9547, '孝元皇后', null, null, null]],
    [[7073, 9547, '孝元皇后', 15]],
    [], [], [], [],
    [[1830, 9547, null, null, null, null, '后']],
  );

  assert.equal(person.primaryName, '孝元皇后');
  assert.equal(person.displayName, '孝元皇后');
  assert.deepEqual(person.names, []);
  assert.deepEqual(person.metadata.nobleTitles, [{
    fief: undefined,
    roleName: '皇后',
    posthumousName: '孝元',
  }]);
});

test('Norbert accepts can_name as a primary persName only when 姓 and 名 reconstruct it', () => {
  const [person] = compileNorbertPersons(
    [[1, '王安石', null, null, null]],
    [[1, 1, '王', 0], [2, 1, '安石', 1]],
    [], [], [], [], [],
  );
  assert.deepEqual(person.names, [
    { text: '王安石', type: 'primary' },
    { text: '王', type: 'family' },
    { text: '安石', type: 'given' },
  ]);
});

test('Norbert keeps a princess title out of primary persName while retaining its supplied surname and title', () => {
  const [person] = compileNorbertPersons(
    [[13450, '海鹽公主', null, null, null]],
    [[30739, 13450, '蕭', 0]],
    [], [], [], [],
    [[1946, 13450, '梁', '海鹽', null, null, '公主']],
  );

  assert.equal(person.primaryName, '海鹽公主');
  assert.equal(person.displayName, '海鹽公主');
  assert.deepEqual(person.names, [{ text: '蕭', type: 'family' }]);
  assert.equal(person.names.some((name) => name.type === 'primary'), false);
  assert.deepEqual(person.metadata.nobleTitles, [{
    dynasty: '梁',
    fief: '海鹽',
    roleName: '公主',
    posthumousName: undefined,
  }]);
});

test('Norbert preserves an approved posthumous abbreviation without inventing one', () => {
  const [withAbbreviation] = compileNorbertPersons(
    [[2, '司馬曜', null, null, null]],
    [], [], [], [], [],
    [[806, 2, '晉', '晉', '孝武', '武', '帝']],
  );
  const [withoutAbbreviation] = compileNorbertPersons(
    [[3, '劉駿', null, null, null]],
    [], [], [], [], [],
    [[695, 3, '宋', '宋', '孝武', null, '帝']],
  );

  assert.equal(withAbbreviation.metadata.nobleTitles[0].posthumousNameAbbr, '武');
  assert.equal(withAbbreviation.metadata.nobleTitles[0].dynasty, '晉');
  assert.equal(withoutAbbreviation.metadata.nobleTitles[0].posthumousNameAbbr, undefined);
});

test('Norbert emits dynasties[] for all person_dynasties while keeping preferred dynasty', () => {
  const [person] = compileNorbertPersons(
    [[1, '某人', null, null, null]],
    [],
    {
      7: { zh: '宋', en: 'Song', startYear: 960, endYear: 1279 },
      46: { zh: '漢', en: 'Han', startYear: -202, endYear: 220 },
    },
    [[1, 1, 7], [2, 1, 46]],
    [],
  );
  assert.equal(person.metadata.dynasty, '宋');
  assert.deepEqual(
    person.metadata.dynasties.map((d) => d.label).sort(),
    ['宋', '漢'],
  );
});
