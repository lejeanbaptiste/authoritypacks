import test from 'node:test';
import assert from 'node:assert/strict';
import {
  expandHuckerDynastyField,
  huckerAffirmsContinuity,
  huckerCoversPeriod,
  indexHuckerOfficeEntries,
  cbdbDynastyToHuckerAtom,
} from './huckerOfficeContinuity.mjs';

test('expandHuckerDynastyField fills inclusive ranges', () => {
  const atoms = expandHuckerDynastyField('SUI-SUNG');
  assert.equal(atoms.has('SUI'), true);
  assert.equal(atoms.has("T'ANG"), true);
  assert.equal(atoms.has('SUNG'), true);
  assert.equal(atoms.has('HAN'), false);
});

test('huckerAffirmsContinuity reasons', () => {
  const byZh = indexHuckerOfficeEntries([
    { zh: '內直局', en: 'Palace Attendance Service', dynasty: 'SUI-SUNG' },
  ]);
  assert.equal(huckerAffirmsContinuity('內直局', '唐', byZh).ok, true);
  assert.equal(huckerAffirmsContinuity('無此官', '唐', byZh).reason, 'hucker-silent');
  assert.equal(cbdbDynastyToHuckerAtom('唐'), "T'ANG");
});

test('huckerCoversPeriod skips only matching dynasty', () => {
  const byZh = indexHuckerOfficeEntries([
    { zh: '參知政事', en: 'Participant in Determining Governmental Matters', dynasty: 'SUNG' },
    { zh: '司經局', en: 'Editorial Service', dynasty: "SUI-T'ANG" },
  ]);
  assert.equal(huckerCoversPeriod('參知政事', '宋', byZh).covered, true);
  assert.equal(huckerCoversPeriod('參知政事', '唐', byZh).covered, false);
  assert.equal(huckerCoversPeriod('司經局', '唐', byZh).covered, true);
  assert.equal(huckerCoversPeriod('司經局', '宋', byZh).covered, false);
  assert.equal(huckerCoversPeriod('無此官', '唐', byZh).covered, false);
});
