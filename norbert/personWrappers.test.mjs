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
