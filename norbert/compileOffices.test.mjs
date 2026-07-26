import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileGeoAdminSuffixes,
  compileNorbertOffices,
  GEO_ADMIN_PLACE_CAT,
  officeRowToCandidate,
} from './compileOffices.mjs';
import { OFFICE_COL } from './officeColumns.mjs';
import { inferNorbertSourceRelations } from '../shared/officeGraph.mjs';
import { compileNorbertAppointments } from './compileAppointments.mjs';

/** Build a sparse office row with only the fields under test. */
function officeRow(overrides = {}) {
  /** @type {any[]} */
  const row = new Array(27).fill(null);
  row[OFFICE_COL.id] = 1;
  row[OFFICE_COL.fullString] = '侍中';
  for (const [key, value] of Object.entries(overrides)) {
    row[OFFICE_COL[key]] = value;
  }
  return row;
}

test('officeRowToCandidate maps full_string to roleName office candidate', () => {
  const candidate = officeRowToCandidate(officeRow({ id: 42, fullString: '侍中' }));
  assert.equal(candidate?.kind, 'office');
  assert.equal(candidate?.primaryName, '侍中');
  assert.deepEqual(candidate?.searchStrings, ['侍中']);
  assert.equal(candidate?.metadata?.teiTag, 'roleName');
  assert.equal(candidate?.authorityId, '42');
});

test('geo-admin suffix 令 gets placeCat and geoAdminSuffix flags', () => {
  const candidate = officeRowToCandidate(
    officeRow({ id: 397, fullString: '令', followsPlace: 1 }),
  );
  assert.equal(candidate?.metadata?.geoAdminSuffix, true);
  assert.equal(candidate?.metadata?.placeCat, GEO_ADMIN_PLACE_CAT['令']);
  assert.equal(candidate?.metadata?.followsPlace, true);
});

test('office cat 曹 is not treated as administrative placeCat', () => {
  const candidate = officeRowToCandidate(
    officeRow({ id: 1, fullString: '三公曹', cat: '曹', isSite: 1 }),
  );
  assert.equal(candidate?.metadata?.placeCat, undefined);
  assert.equal(candidate?.metadata?.geoAdminSuffix, undefined);
});

test('compileGeoAdminSuffixes collects flagged offices', () => {
  const offices = compileNorbertOffices([
    officeRow({ id: 1, fullString: '侍中' }),
    officeRow({ id: 397, fullString: '令', followsPlace: 1 }),
    officeRow({ id: 660, fullString: '太守' }),
  ]);
  const suffixes = compileGeoAdminSuffixes(offices);
  assert.deepEqual(
    suffixes.map((s) => s.string),
    ['令', '太守'],
  );
  assert.equal(suffixes.find((s) => s.string === '令')?.placeCat, '縣');
});

test('officeRowToCandidate preserves the Norbert structure fields', () => {
  const candidate = officeRowToCandidate(
    officeRow({
      id: 7,
      fullString: '尚書省吏部',
      parentString: '尚書省',
      prefix: '吏',
      core: '部',
      cat: '省',
      catIsSuffix: 1,
      followsOffice: 1,
      isCollective: 1,
      isMilitary: 1,
      isReligious: 1,
      isMeritTitle: 1,
      isPrestigeTitle: 1,
      isQualifier: 1,
      yieldPrefix: 1,
    }),
  );
  assert.equal(candidate?.metadata?.entityId, 'norbert:office:7');
  assert.equal(candidate?.metadata?.parentString, '尚書省');
  assert.equal(candidate?.metadata?.prefix, '吏');
  assert.equal(candidate?.metadata?.core, '部');
  assert.equal(candidate?.metadata?.category, '省');
  assert.equal(candidate?.metadata?.categoryIsSuffix, true);
  assert.equal(candidate?.metadata?.followsOffice, true);
  assert.equal(candidate?.metadata?.isCollective, true);
  assert.equal(candidate?.metadata?.isMilitary, true);
  assert.equal(candidate?.metadata?.isReligious, true);
  assert.equal(candidate?.metadata?.isMeritTitle, true);
  assert.equal(candidate?.metadata?.isPrestigeTitle, true);
  assert.equal(candidate?.metadata?.isQualifier, true);
  assert.equal(candidate?.metadata?.yieldPrefix, true);
});

test('explicit non-place parent strings become inferred parentOf relations', () => {
  const offices = compileNorbertOffices([
    officeRow({ id: 1, fullString: '尚書省' }),
    officeRow({
      id: 2,
      fullString: '尚書省吏部',
      parentString: '尚書省',
      parentIsSite: 0,
    }),
    officeRow({
      id: 3,
      fullString: '鉅鹿都尉',
      parentString: '鉅鹿',
      parentIsSite: 1,
    }),
  ]);
  assert.deepEqual(inferNorbertSourceRelations(offices), [
    {
      id: 'norbert:parent:1:2',
      type: 'parentOf',
      subject: 'norbert:office:1',
      object: 'norbert:office:2',
      source: 'Norbert',
      confidence: 'inferred',
      evidence: {
        rule: 'explicit-parent-string',
        table: 'office',
        sourceIds: ['1', '2'],
        labels: ['尚書省', '尚書省吏部'],
      },
    },
  ]);
});

test('Norbert person_offices compile links person and unique office rows', () => {
  const offices = compileNorbertOffices([
    officeRow({ id: 7, fullString: '侍中' }),
  ]);
  const appointments = compileNorbertAppointments([
    new Array(17).fill(null).map((value, index) => ({
      0: 99,
      1: 123,
      2: '侍中',
      12: '史書',
    }[index] ?? value)),
  ], offices);
  assert.deepEqual(appointments, [{
    source: 'Norbert',
    authorityId: '99',
    person: { source: 'Norbert', authorityId: '123' },
    office: { source: 'Norbert', authorityId: '7', name: '侍中' },
    sourceRef: '史書',
  }]);
});
