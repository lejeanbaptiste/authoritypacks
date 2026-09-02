import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dynastyFromOfficeNote,
  isOfficeCrossReferenceNote,
  officeNoteGloss,
  resolveCbdbOfficePresentation,
} from './officeMetadata.mjs';
import { cbdbOfficeClue } from '../shared/clue.mjs';
import { loadCbdbDynastyMap } from '../shared/dynastyMap.mjs';

test('dynastyFromOfficeNote reads polity markers in CBDB glosses', () => {
  assert.equal(dynastyFromOfficeNote('掌晋国最高职力'), '晋');
  assert.equal(dynastyFromOfficeNote('晋侯侍医'), '晋');
  assert.equal(dynastyFromOfficeNote('掌东西周的最高权力'), '周');
  assert.equal(dynastyFromOfficeNote('掌出使'), undefined);
});

test('officeNoteGloss keeps definitional notes and drops cross-references', () => {
  assert.equal(isOfficeCrossReferenceNote('參見 zhou yi bo shi（周易博士）'), true);
  assert.equal(isOfficeCrossReferenceNote('同 Gu Yuan（鼓院）'), true);
  assert.equal(officeNoteGloss('掌出使', undefined), '掌出使');
  assert.equal(officeNoteGloss('晋侯侍医', '晋'), '侍医');
  assert.equal(officeNoteGloss('參見 zhou yi bo shi（周易博士）', undefined), undefined);
});

test('resolveCbdbOfficePresentation replaces 漢前 with office-type period', () => {
  const dynastyMap = loadCbdbDynastyMap(null);
  const resolved = resolveCbdbOfficePresentation({
    baseDynasty: '漢前',
    baseStartYear: -1100,
    baseEndYear: -206,
    note: '掌外事',
    officeTypeLabels: ['春秋'],
    dynastyMap,
  });
  assert.equal(resolved.dynasty, '春秋');
  assert.equal(resolved.startYear, -770);
  assert.equal(resolved.endYear, -476);
  assert.equal(resolved.gloss, '掌外事');
});

test('resolveCbdbOfficePresentation prefers note dynasty over office type', () => {
  const dynastyMap = loadCbdbDynastyMap(null);
  const resolved = resolveCbdbOfficePresentation({
    baseDynasty: '漢前',
    baseStartYear: -1100,
    baseEndYear: -206,
    note: '晋侯侍医',
    officeTypeLabels: ['春秋'],
    dynastyMap,
  });
  assert.equal(resolved.dynasty, '晋');
  assert.equal(resolved.startYear, -770);
  assert.equal(resolved.endYear, -376);
  assert.equal(resolved.gloss, '侍医');
});

test('resolveCbdbOfficePresentation leaves later dynasties unchanged', () => {
  const dynastyMap = loadCbdbDynastyMap(null);
  const resolved = resolveCbdbOfficePresentation({
    baseDynasty: '宋',
    baseStartYear: 960,
    baseEndYear: 1279,
    note: '參見 zuo bu que（左補闕）',
    officeTypeLabels: [],
    dynastyMap,
  });
  assert.equal(resolved.dynasty, '宋');
  assert.equal(resolved.gloss, undefined);
});

test('cbdbOfficeClue includes gloss before dynasty', () => {
  assert.equal(
    cbdbOfficeClue({ name: '行人', gloss: '掌外事', dynastyChn: '春秋' }),
    '行人 (掌外事, 春秋)',
  );
});
