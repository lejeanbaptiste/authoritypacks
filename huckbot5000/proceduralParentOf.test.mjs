import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanOfficeGloss,
  buildOfficeGlossIndex,
  resolveOfficeGloss,
  indexParentOfByChild,
  composeParentOfTranslation,
  tryParentOfTranslation,
  partitionParentOfTargets,
} from './proceduralParentOf.mjs';

test('cleanOfficeGloss strips Hucker tag and rejects placeholders', () => {
  assert.equal(cleanOfficeGloss('Heir Apparent (Hucker)'), 'Heir Apparent');
  assert.equal(cleanOfficeGloss('[Not Yet Translated]'), null);
  assert.equal(cleanOfficeGloss(''), null);
});

test('indexParentOfByChild keeps allowlisted prefix compounds only', () => {
  const byChild = indexParentOfByChild([
    {
      id: 'norbert:parent:a:b',
      type: 'parentOf',
      evidence: { labels: ['太子', '太子右庶子'] },
    },
    {
      id: 'norbert:parent:c:d',
      type: 'parentOf',
      evidence: { labels: ['尚書', '尚書僕射'] }, // not allowlisted
    },
    {
      id: 'norbert:parent:e:f',
      type: 'parentOf',
      evidence: { labels: ['太子', '太子僕'] }, // rem too short
    },
    {
      id: 'cbdb:office-type-parent:0:01',
      type: 'parentOf',
      evidence: { rule: 'office-type-tree-parent' }, // no labels
    },
  ]);
  assert.equal(byChild.size, 1);
  assert.equal(byChild.get('太子右庶子').parent, '太子');
});

test('composeParentOfTranslation uses of-the template', () => {
  assert.equal(
    composeParentOfTranslation('Right Mentor', 'Heir Apparent'),
    'Right Mentor of the Heir Apparent',
  );
});

test('tryParentOfTranslation composes when remainder gloss is known', () => {
  const parentOfByChild = indexParentOfByChild([
    {
      id: 'rel1',
      type: 'parentOf',
      evidence: { labels: ['太子', '太子右庶子'] },
    },
  ]);
  const glossIndex = buildOfficeGlossIndex([
    { primaryName: '右庶子', metadata: { translation: 'Right Mentor', dynasty: '唐' } },
  ]);
  const result = tryParentOfTranslation(
    { zh: '太子右庶子', dynasty: '唐' },
    parentOfByChild,
    glossIndex,
  );
  assert.equal(result.gloss, 'Right Mentor of the Heir Apparent');
  assert.equal(result.rule, 'parentOf');
  assert.equal(result.remainder, '右庶子');
});

test('tryParentOfTranslation rejects remainder gloss that already names the parent', () => {
  const parentOfByChild = indexParentOfByChild([
    {
      id: 'rel1',
      type: 'parentOf',
      evidence: { labels: ['太子', '太子少詹事'] },
    },
  ]);
  const glossIndex = buildOfficeGlossIndex([
    {
      primaryName: '少詹事',
      metadata: {
        translation: 'Vice Supervisor of Household of the Heir Apparent',
        dynasty: '唐',
      },
    },
  ]);
  assert.equal(
    tryParentOfTranslation({ zh: '太子少詹事', dynasty: '唐' }, parentOfByChild, glossIndex),
    null,
  );
});

test('resolveOfficeGloss prefers dynasty then unique fallback', () => {
  const glossIndex = buildOfficeGlossIndex([
    { primaryName: '太師', metadata: { translation: 'Grand Preceptor', dynasty: '唐' } },
    { primaryName: '太師', metadata: { translation: 'Grand Preceptor (Hucker)', dynasty: '宋' } },
    { primaryName: '僕射', metadata: { translation: 'Vice Director', dynasty: '唐' } },
    { primaryName: '僕射', metadata: { translation: 'Chief Councillor', dynasty: '宋' } },
  ]);
  assert.equal(resolveOfficeGloss('太師', '唐', glossIndex), 'Grand Preceptor');
  assert.equal(resolveOfficeGloss('太師', '明', glossIndex), 'Grand Preceptor');
  assert.equal(resolveOfficeGloss('僕射', '明', glossIndex), null);
});

test('partitionParentOfTargets splits buckets', () => {
  const parentOfByChild = indexParentOfByChild([
    {
      id: 'rel1',
      type: 'parentOf',
      evidence: { labels: ['太子', '太子太師'] },
    },
  ]);
  const glossIndex = buildOfficeGlossIndex([
    { primaryName: '太師', metadata: { translation: 'Grand Preceptor' } },
  ]);
  const { procedural, llm } = partitionParentOfTargets(
    [
      { zh: '太子太師', dynasty: '唐', key: '太子太師\t唐' },
      { zh: '枝江令', dynasty: '唐', key: '枝江令\t唐' },
    ],
    parentOfByChild,
    glossIndex,
  );
  assert.equal(procedural.length, 1);
  assert.equal(procedural[0].procedural.gloss, 'Grand Preceptor of the Heir Apparent');
  assert.equal(llm.length, 1);
  assert.equal(llm[0].zh, '枝江令');
});
