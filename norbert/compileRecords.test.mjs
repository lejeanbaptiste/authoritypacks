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
  assert.equal(person.metadata.dateSource, undefined);
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
