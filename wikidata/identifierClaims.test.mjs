import test from 'node:test';
import assert from 'node:assert/strict';
import {
  crosswalkFromEntity,
  compiledCrosswalkFromRaw,
  externalIdClaimValues,
  normalizeIdentifier,
} from './identifierClaims.mjs';

test('normalizeIdentifier strips CBDB leading zeros', () => {
  assert.equal(normalizeIdentifier('01762', 'cbdbId'), '1762');
  assert.equal(normalizeIdentifier('0000000', 'cbdbId'), '0000000');
});

test('normalizeIdentifier keeps VIAF digits', () => {
  assert.equal(normalizeIdentifier('https://viaf.org/viaf/12345', 'digits'), '12345');
});

test('externalIdClaimValues reads string external-id snaks', () => {
  const entity = {
    claims: {
      P497: [
        {
          mainsnak: {
            snaktype: 'value',
            datavalue: { type: 'string', value: '0005581' },
          },
        },
      ],
    },
  };
  assert.deepEqual(externalIdClaimValues(entity, 'P497'), ['0005581']);
});

test('crosswalkFromEntity maps listed properties', () => {
  const entity = {
    id: 'Q5581',
    claims: {
      P497: [{ mainsnak: { snaktype: 'value', datavalue: { type: 'string', value: '0005581' } } }],
      P214: [{ mainsnak: { snaktype: 'value', datavalue: { type: 'string', value: '24645678' } } }],
      P1187: [{ mainsnak: { snaktype: 'value', datavalue: { type: 'string', value: 'A000004' } } }],
    },
  };
  assert.deepEqual(crosswalkFromEntity(entity), {
    cbdb: '5581',
    viaf: '24645678',
    dila: 'A000004',
  });
});

test('compiledCrosswalkFromRaw adds wikidata qid', () => {
  assert.deepEqual(
    compiledCrosswalkFromRaw({ qid: 'Q5581', crosswalk: { cbdb: '5581' } }),
    { cbdb: '5581', wikidata: ['5581'] },
  );
});
