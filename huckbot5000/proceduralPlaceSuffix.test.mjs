import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseGeoAdminCompound,
  buildSuffixGlossIndex,
  resolveSuffixGloss,
  composePlaceSuffixTranslation,
  tryProceduralTranslation,
  partitionProceduralTargets,
  romanizePlaceStem,
} from './proceduralPlaceSuffix.mjs';

test('parseGeoAdminCompound accepts county magistrate compounds', () => {
  assert.deepEqual(parseGeoAdminCompound('枝江令'), {
    stem: '枝江',
    suffix: '令',
    placeCat: '縣',
  });
  assert.deepEqual(parseGeoAdminCompound('豫章太守'), {
    stem: '豫章',
    suffix: '太守',
    placeCat: '郡',
  });
});

test('parseGeoAdminCompound accepts X州刺史 place compounds', () => {
  assert.deepEqual(parseGeoAdminCompound('豫州刺史'), {
    stem: '豫州',
    suffix: '刺史',
    placeCat: '州',
  });
  assert.deepEqual(parseGeoAdminCompound('蘇州刺史'), {
    stem: '蘇州',
    suffix: '刺史',
    placeCat: '州',
  });
  assert.deepEqual(parseGeoAdminCompound('同州刺史'), {
    stem: '同州',
    suffix: '刺史',
    placeCat: '州',
  });
});

test('parseGeoAdminCompound still rejects 州-final stems for 令/太守', () => {
  assert.equal(parseGeoAdminCompound('豫州令'), null);
  assert.equal(parseGeoAdminCompound('同州太守'), null);
});

test('parseGeoAdminCompound accepts 同 as a place, not a prefix', () => {
  assert.ok(parseGeoAdminCompound('同安太守'));
  assert.ok(parseGeoAdminCompound('同谷太守'));
});

test('parseGeoAdminCompound rejects institutional 令 titles', () => {
  assert.equal(parseGeoAdminCompound('尚書令'), null);
  assert.equal(parseGeoAdminCompound('黃門令'), null);
  assert.equal(parseGeoAdminCompound('太子家令'), null);
  assert.equal(parseGeoAdminCompound('縣令'), null);
});

test('parseGeoAdminCompound rejects prefixed compounds', () => {
  assert.equal(parseGeoAdminCompound('督太守'), null);
  assert.equal(parseGeoAdminCompound('總管刺史'), null);
  assert.equal(parseGeoAdminCompound('副刺史'), null);
});

test('parseGeoAdminCompound rejects dynasty-prefixed stems', () => {
  assert.equal(parseGeoAdminCompound('北魏華山太守'), null);
  assert.equal(parseGeoAdminCompound('東魏太守'), null);
  assert.equal(parseGeoAdminCompound('東魏令'), null);
});

test('parseGeoAdminCompound rejects stems ending in 左/右', () => {
  assert.equal(parseGeoAdminCompound('光城左太守'), null);
  assert.equal(parseGeoAdminCompound('南淮安左太守'), null);
});

test('parseGeoAdminCompound rejects office titles embedded in the stem', () => {
  assert.equal(parseGeoAdminCompound('郡守刺史'), null);
});

test('parseGeoAdminCompound blocklists known false positive 遷安固太守', () => {
  assert.equal(parseGeoAdminCompound('遷安固太守'), null);
  assert.ok(parseGeoAdminCompound('安固太守'));
});

test('romanizePlaceStem concatenates toneless pinyin', () => {
  assert.equal(romanizePlaceStem('遼東'), 'Liaodong');
  assert.equal(romanizePlaceStem('安固'), 'Angu');
  assert.equal(romanizePlaceStem('枝江'), 'Zhijiang');
  assert.equal(romanizePlaceStem('豫州'), 'Yuzhou');
});

test('resolveSuffixGloss prefers dynasty-specific CBDB bare row', () => {
  const index = buildSuffixGlossIndex([
    {
      primaryName: '刺史',
      metadata: { dynasty: '宋', translation: 'Prefect' },
    },
    {
      primaryName: '縣令',
      metadata: { dynasty: '唐', translation: 'District Magistrate' },
    },
  ]);
  assert.equal(resolveSuffixGloss('刺史', '宋', index), 'Prefect');
  assert.equal(resolveSuffixGloss('令', '唐', index), 'District Magistrate');
  assert.equal(resolveSuffixGloss('令', '漢', index), 'District Magistrate');
});

test('tryProceduralTranslation romanizes the place stem', () => {
  const index = buildSuffixGlossIndex([
    { primaryName: '縣令', metadata: { dynasty: '唐', translation: 'District Magistrate' } },
  ]);
  const result = tryProceduralTranslation({ zh: '枝江令', dynasty: '唐' }, index);
  assert.equal(result.gloss, 'District Magistrate of Zhijiang');
  assert.equal(result.placeRomanization, 'Zhijiang');
  assert.equal(result.rule, 'place+suffix');
});

test('tryProceduralTranslation handles 刺史 of a 州', () => {
  const index = buildSuffixGlossIndex([]);
  const result = tryProceduralTranslation({ zh: '豫州刺史', dynasty: '唐' }, index);
  assert.equal(result.gloss, 'Regional Inspector of Yuzhou');
  assert.equal(result.stem, '豫州');
});

test('partitionProceduralTargets splits buckets', () => {
  const index = buildSuffixGlossIndex([]);
  const { procedural, llm } = partitionProceduralTargets(
    [
      { zh: '枝江令', dynasty: '唐' },
      { zh: '尚書令', dynasty: '唐' },
      { zh: '遷安固太守', dynasty: '隋' },
    ],
    index,
  );
  assert.equal(procedural.length, 1);
  assert.equal(llm.length, 2);
  assert.equal(procedural[0].procedural.gloss, 'District Magistrate of Zhijiang');
  assert.equal(llm.some((t) => t.zh === '遷安固太守'), true);
});

test('composePlaceSuffixTranslation uses romanized place', () => {
  assert.equal(
    composePlaceSuffixTranslation({ stem: '清河', suffix: '太守' }, 'Commandery Governor', 'Qinghe'),
    'Commandery Governor of Qinghe',
  );
});
