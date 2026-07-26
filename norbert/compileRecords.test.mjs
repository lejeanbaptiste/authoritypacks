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
