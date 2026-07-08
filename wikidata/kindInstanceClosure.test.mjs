import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  entityP31MatchesSpec,
  resetKindInstanceClosureCache,
  setKindClosurePath,
} from './kindInstanceClosure.mjs';
import { entityMatchesKind } from './kindMatch.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureClosure = path.join(__dirname, 'fixtures/kind-instance-closure.fixture.json');

const workSpec = {
  instanceOf: ['Q7725634'],
  excludeInstanceOf: ['Q13442814'],
};

test('entityP31MatchesSpec — direct root without closure', () => {
  assert.equal(entityP31MatchesSpec(['Q7725634'], workSpec, null), true);
  assert.equal(entityP31MatchesSpec(['Q5185279'], workSpec, null), false);
});

test('entityP31MatchesSpec — exclude closure drops film even when included', () => {
  const closure = {
    instanceOfRoots: ['Q7725634'],
    instanceOfClosure: ['Q7725634', 'Q11424', 'Q5185279'],
    excludeInstanceOfRoots: ['Q11424'],
    excludeInstanceOfClosure: ['Q11424', 'Q24869'],
  };
  assert.equal(entityP31MatchesSpec(['Q7725634'], workSpec, closure), true);
  assert.equal(entityP31MatchesSpec(['Q11424'], workSpec, closure), false);
  assert.equal(entityP31MatchesSpec(['Q5185279'], workSpec, closure), true);
  assert.equal(entityP31MatchesSpec(['Q5185279', 'Q11424'], workSpec, closure), false);
});

test('entityP31MatchesSpec — subclass via closure', () => {
  const closure = {
    instanceOfRoots: ['Q7725634'],
    instanceOfClosure: ['Q7725634', 'Q5185279'],
    excludeInstanceOfRoots: ['Q13442814'],
    excludeInstanceOfClosure: ['Q13442814', 'Q17328189'],
  };
  assert.equal(entityP31MatchesSpec(['Q5185279'], workSpec, closure), true);
  assert.equal(entityP31MatchesSpec(['Q9999999'], workSpec, closure), false);
  assert.equal(entityP31MatchesSpec(['Q5185279', 'Q17328189'], workSpec, closure), false);
});

test('entityMatchesKind poem subclass matches work when closure file loaded', () => {
  resetKindInstanceClosureCache();
  setKindClosurePath(fixtureClosure);

  const kinds = { work: workSpec };
  const entity = {
    type: 'item',
    id: 'Q2',
    labels: { 'zh-hant': { value: '春望' } },
    claims: {
      P31: [
        {
          mainsnak: {
            snaktype: 'value',
            datavalue: { type: 'wikibase-entityid', value: { id: 'Q5185279' } },
          },
        },
      ],
    },
  };

  assert.equal(
    entityMatchesKind(entity, 'work', kinds, { labelLangs: ['zh-hant'], membership: 'label-only' }),
    true,
  );

  resetKindInstanceClosureCache();
});

test('subclassClosureQuery shape', async () => {
  const { subclassClosureQuery } = await import('./sparqlClient.mjs');
  assert.match(subclassClosureQuery('Q7725634'), /wdt:P279\* wd:Q7725634/);
});
