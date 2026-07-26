import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAdminSuffixMap, suffixForAdminType, suffixedNameVariant } from './adminVocabulary.mjs';

test('loadAdminSuffixMap — loads concordance and is case-insensitive', () => {
  const map = loadAdminSuffixMap();
  assert.equal(map.get('xian'), '縣');
  assert.ok(map.size > 20);
});

test('suffixForAdminType — traditional-script suffix, not CHGIS simplified', () => {
  // CBDB c_name_chn is traditional (e.g. 賓縣); CHGIS TYPE_CH is simplified (县).
  // The suffix appended to CBDB names must match CBDB's own script.
  assert.equal(suffixForAdminType('Xian'), '縣');
  assert.equal(suffixForAdminType('xian'), '縣');
  assert.equal(suffixForAdminType('Zhou'), '州');
});

test('suffixForAdminType — unknown type returns undefined', () => {
  assert.equal(suffixForAdminType('NotARealType'), undefined);
  assert.equal(suffixForAdminType(null), undefined);
  assert.equal(suffixForAdminType(undefined), undefined);
});

test('suffixedNameVariant — appends traditional suffix to bare name', () => {
  assert.equal(suffixedNameVariant('竟陵', 'Xian'), '竟陵縣');
  assert.equal(suffixedNameVariant('保德', 'Zhou'), '保德州');
});

test('suffixedNameVariant — no-op when name already carries the suffix', () => {
  assert.equal(suffixedNameVariant('竟陵縣', 'Xian'), undefined);
});

test('suffixedNameVariant — no-op when admin type has no known suffix', () => {
  assert.equal(suffixedNameVariant('竟陵', 'kailuo'), undefined);
});
