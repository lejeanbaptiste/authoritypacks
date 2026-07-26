import { writeNdjson } from './ndjson.mjs';

/** @typedef {import('./types.mjs').AuthorityCandidate} AuthorityCandidate */

const DEFAULT_RADIUS_KM = 5;

/**
 * Resolve source-preserving origin assertions into review groups. This does
 * not mint entities and only links people when an explicit person crosswalk
 * or concordance link is supplied.
 *
 * @param {Record<string, AuthorityCandidate[]>} peopleBySource
 * @param {{ source: string, authorityId: string, targetSource: string, targetAuthorityId: string }[]} links
 * @param {{ radiusKm?: number }} [options]
 */
export function resolveOriginGroups(peopleBySource, links = [], options = {}) {
  const radiusKm = options.radiusKm ?? DEFAULT_RADIUS_KM;
  const people = Object.entries(peopleBySource).flatMap(([source, records]) =>
    records.map((person) => ({ source, person, key: personKey(source, person.authorityId) })));
  const byKey = new Map(people.map((entry) => [entry.key, entry]));
  const parent = new Map(people.map((entry) => [entry.key, entry.key]));
  const find = (key) => {
    let root = parent.get(key) ?? key;
    while (parent.get(root) !== root) root = parent.get(root);
    let current = key;
    while (parent.get(current) !== current) {
      const next = parent.get(current);
      parent.set(current, root);
      current = next;
    }
    return root;
  };
  const union = (a, b) => {
    if (!byKey.has(a) || !byKey.has(b)) return;
    const left = find(a);
    const right = find(b);
    if (left !== right) parent.set(right, left);
  };

  for (const link of links) {
    union(personKey(link.source, link.authorityId), personKey(link.targetSource, link.targetAuthorityId));
  }
  for (const entry of people) {
    const crosswalk = entry.person.metadata?.crosswalk ?? {};
    for (const [targetSource, values] of Object.entries(crosswalk)) {
      const ids = Array.isArray(values) ? values : [values];
      for (const id of ids) union(entry.key, personKey(targetSource, id));
    }
  }

  /** @type {Map<string, typeof people>} */
  const peopleGroups = new Map();
  for (const entry of people) {
    const root = find(entry.key);
    const group = peopleGroups.get(root) ?? [];
    group.push(entry);
    peopleGroups.set(root, group);
  }

  const output = [];
  for (const [root, group] of peopleGroups) {
    const assertions = group.flatMap(({ source, person }) =>
      (person.metadata?.origin ?? []).map((origin) => ({
        ...origin,
        person: { source, authorityId: String(person.authorityId), primaryName: person.primaryName },
      })));
    const types = [...new Set(assertions.map((origin) => origin.originType ?? 'placeOfOrigin'))];
    for (const originType of types) {
      const typed = assertions.filter((origin) => (origin.originType ?? 'placeOfOrigin') === originType);
      const points = typed.map((origin) => origin.geo).filter(Boolean);
      const maxDistanceKm = maximumDistanceKm(points);
      const placeTypes = [...new Set(typed.map((origin) => origin.placeType).filter(Boolean).map(String))];
      const conflictReasons = [];
      if (points.length === 0) conflictReasons.push('missing-geo');
      if (maxDistanceKm > radiusKm) conflictReasons.push('distance');
      if (placeTypes.length > 1) conflictReasons.push('place-type');
      const decision = points.length === 0
        ? 'id-mode'
        : conflictReasons.length > 0 ? 'conflict-id-mode' : 'coordinate-mode';
      output.push({
        groupId: root,
        originType,
        decision,
        identityBasis: group.length > 1 ? 'crosswalk' : 'authority-local',
        radiusKm,
        maxDistanceKm: Math.round(maxDistanceKm * 100) / 100,
        conflictReasons,
        placeTypes,
        people: group.map(({ source, person }) => ({
          source,
          authorityId: String(person.authorityId),
          primaryName: person.primaryName,
        })),
        assertions: typed,
      });
    }
  }
  return output;
}

/** @param {string} source @param {string|number} authorityId */
function personKey(source, authorityId) {
  return `${String(source).toLowerCase()}:${authorityId}`;
}

/** @param {{ lat: number, lon: number }[]} points */
function maximumDistanceKm(points) {
  let maximum = 0;
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      maximum = Math.max(maximum, haversineDistanceKm(points[i], points[j]));
    }
  }
  return maximum;
}

/** @param {{ lat: number, lon: number }} a @param {{ lat: number, lon: number }} b */
function haversineDistanceKm(a, b) {
  const radians = Math.PI / 180;
  const dLat = (b.lat - a.lat) * radians;
  const dLon = (b.lon - a.lon) * radians;
  const value = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin(dLon / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

/** @param {string} filePath @param {object[]} groups */
export function writeOriginReview(filePath, groups) {
  writeNdjson(filePath, groups);
}
