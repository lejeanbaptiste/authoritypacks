import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isBlockedPersonString,
  isMissingNameToken,
} from './personStringPolicy.mjs';

test('isMissingNameToken catches dump placeholders', () => {
  assert.equal(isMissingNameToken('nan'), true);
  assert.equal(isMissingNameToken('NaN'), true);
  assert.equal(isMissingNameToken('NAN'), true);
  assert.equal(isMissingNameToken(''), true);
  assert.equal(isMissingNameToken('王安石'), false);
  assert.equal(isMissingNameToken('Nancy'), false);
});

test('isBlockedPersonString blocks nan in any case', () => {
  assert.equal(isBlockedPersonString('nan'), true);
  assert.equal(isBlockedPersonString('NaN'), true);
});
