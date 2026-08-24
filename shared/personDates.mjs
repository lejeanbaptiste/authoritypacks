/**
 * Segregate biographical years from tagging-pack filter anchors.
 *
 * Tagging packs need *some* temporal handle for the date slider. Data packs /
 * entity import need real vital dates and real floruit — never index years as fl.
 *
 * Priority for the filter interval written onto the person:
 *   1. birth / death          → dateSource: 'fine'     (importable as vitals)
 *   2. floruit earliest/latest → dateSource: 'floruit'  (real fl.; store as fl. range)
 *   3. index / mean year ± window → dateSource: 'index' (filter only; never fl.)
 *   4. else                   → dateSource: 'nationality' and **no** start/end
 *      (dynasty years live on `nationality[]` for the filter fallback)
 *
 * @typedef {'fine' | 'floruit' | 'index' | 'nationality'} PersonDateSource
 */

/** Half-width of the CBDB-style index-year filter window (years). */
export const INDEX_YEAR_WINDOW = 30;

/**
 * @param {{
 *   birthYear?: number | null,
 *   deathYear?: number | null,
 *   flEarliest?: number | null,
 *   flLatest?: number | null,
 *   indexYear?: number | null,
 *   indexWindow?: number,
 * }} input
 * @returns {{
 *   dateSource: PersonDateSource,
 *   startYear?: number,
 *   endYear?: number,
 *   indexYear?: number,
 *   flStart?: number,
 *   flEnd?: number,
 * }}
 */
export function personDateMetadata(input) {
  const birth = finiteYear(input.birthYear);
  const death = finiteYear(input.deathYear);
  const flEarliest = finiteYear(input.flEarliest);
  const flLatest = finiteYear(input.flLatest);
  const indexYear = finiteYear(input.indexYear);
  const window = input.indexWindow ?? INDEX_YEAR_WINDOW;

  if (birth != null || death != null) {
    return {
      dateSource: 'fine',
      ...(birth != null ? { startYear: birth } : {}),
      ...(death != null ? { endYear: death } : {}),
      ...(flEarliest != null ? { flStart: flEarliest } : {}),
      ...(flLatest != null ? { flEnd: flLatest } : {}),
      ...(indexYear != null ? { indexYear } : {}),
    };
  }

  if (flEarliest != null || flLatest != null) {
    const start = flEarliest ?? flLatest;
    const end = flLatest ?? flEarliest;
    return {
      dateSource: 'floruit',
      startYear: start,
      endYear: end,
      flStart: flEarliest ?? undefined,
      flEnd: flLatest ?? undefined,
      ...(indexYear != null ? { indexYear } : {}),
    };
  }

  if (indexYear != null) {
    return {
      dateSource: 'index',
      indexYear,
      startYear: indexYear - window,
      endYear: indexYear + window,
    };
  }

  return { dateSource: 'nationality' };
}

/**
 * Years safe to treat as birth/death vitals (entity import / TEI birth–death).
 * Floruit is real floruit (separate import path); index/nationality return empty.
 * Re-applies the year-0 sentinel drop so older packs that still store
 * `startYear: 0` with `dateSource: 'fine'` do not import a fake birth.
 *
 * @param {{ dateSource?: string, startYear?: number, endYear?: number } | null | undefined} meta
 */
export function biographicalYearsFromMetadata(meta) {
  if (!meta || meta.dateSource !== 'fine') return {};
  const startYear = finiteYear(meta.startYear);
  const endYear = finiteYear(meta.endYear);
  return {
    ...(startYear != null ? { startYear } : {}),
    ...(endYear != null ? { endYear } : {}),
  };
}

/**
 * Real floruit earliest/latest (`dateSource: 'floruit'`).
 * @param {{ dateSource?: string, startYear?: number, endYear?: number } | null | undefined} meta
 */
export function floruitYearsFromMetadata(meta) {
  if (!meta || meta.dateSource !== 'floruit') return {};
  const startYear = finiteYear(meta.startYear);
  const endYear = finiteYear(meta.endYear) ?? startYear;
  const resolvedStart = startYear ?? endYear;
  if (resolvedStart == null) return {};
  return {
    startYear: resolvedStart,
    endYear: endYear ?? resolvedStart,
  };
}

/**
 * Whether startYear/endYear on the candidate are a filter interval (fine,
 * floruit, or index). Dynasty-only rows use nationality[] instead.
 *
 * @param {{ dateSource?: string, startYear?: number, endYear?: number } | null | undefined} meta
 */
export function hasFilterInterval(meta) {
  if (!meta) return false;
  if (meta.dateSource === 'nationality') return false;
  // Legacy packs omitted dateSource but set years — treat as filter interval.
  if (meta.dateSource == null) {
    return meta.startYear != null || meta.endYear != null;
  }
  return meta.dateSource === 'fine' || meta.dateSource === 'floruit' || meta.dateSource === 'index';
}

/** @param {unknown} value */
function finiteYear(value) {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  // CBDB and some legacy exports use 0 for "unknown" — never treat as birth/death.
  if (!Number.isFinite(n) || n === 0) return null;
  return n;
}
