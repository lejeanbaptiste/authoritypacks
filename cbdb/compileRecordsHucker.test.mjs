import test from 'node:test';
import assert from 'node:assert/strict';
import { isHuckerSourced } from './compileRecords.mjs';

test('isHuckerSourced matches closed (Hucker) citation', () => {
  assert.equal(isHuckerSourced('Supervisor (Hucker)'), true);
});

test('isHuckerSourced matches truncated (Hucker citation (upstream id 987)', () => {
  assert.equal(
    isHuckerSourced('Senior Subalterns of the Prefecture or District (Hucker'),
    true,
  );
});

test('isHuckerSourced leaves non-Hucker glosses alone', () => {
  assert.equal(isHuckerSourced('Erudite'), false);
  assert.equal(isHuckerSourced(''), false);
  assert.equal(isHuckerSourced(null), false);
  assert.equal(isHuckerSourced(undefined), false);
});
