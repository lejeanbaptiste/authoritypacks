import { normalizeSurface } from '../shared/normalize.mjs';

/** Norbert `person_names.name_type_id` for 姓 (surname). */
export const SURNAME_NAME_TYPE_ID = 0;

/**
 * Collect unique surnames from raw `person_names` dump rows.
 * @param {any[][]} nameRows `(id, person_id, name, name_type_id, …)`
 * @returns {string[]} longest first
 */
export function compileNorbertSurnamesFromNameRows(nameRows) {
  /** @type {Set<string>} */
  const surnames = new Set();
  for (const row of nameRows) {
    const name = row[2];
    const type = row[3];
    if (type !== SURNAME_NAME_TYPE_ID || name == null) continue;
    const normalized = normalizeSurface(String(name));
    if (normalized) surnames.add(normalized);
  }
  return sortSurnamesLongestFirst([...surnames]);
}

/**
 * Fallback: extract surnames already mapped to Grognard `family` in compiled persons.ndjson.
 * @param {Iterable<{ names?: { text?: string; type?: string }[] }>} persons
 */
export function compileNorbertSurnamesFromPersons(persons) {
  /** @type {Set<string>} */
  const surnames = new Set();
  for (const person of persons) {
    for (const entry of person.names ?? []) {
      if (entry.type !== 'family') continue;
      const normalized = normalizeSurface(entry.text ?? '');
      if (normalized) surnames.add(normalized);
    }

    const primary = normalizeSurface(person.primaryName ?? '');
    if (primary && /^[\u4e00-\u9fff]{2,4}$/u.test(primary)) {
      const first = [...primary][0];
      if (first) surnames.add(first);
    }
  }
  return sortSurnamesLongestFirst([...surnames]);
}

/** @param {string[]} surnames */
export function sortSurnamesLongestFirst(surnames) {
  return [...new Set(surnames)].sort(
    (a, b) => b.length - a.length || a.localeCompare(b, 'zh-Hans'),
  );
}
