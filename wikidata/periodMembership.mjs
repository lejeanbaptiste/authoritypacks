/**
 * Pre-Ming person membership: P27 / P2348 / birth-death overlap (W2b).
 *
 * Ming begins CE 1368. Pre-Ming packs include persons who lived on or before 1367,
 * or carry a pre-Ming dynasty / period on Wikidata.
 */

/** Last year before the Ming (CE 1368). */
export const PRE_MING_END_YEAR = 1367;

/** P27 values for post-pre-Ming states — used to drop undated Ming/Qing/modern-only rows at compile. */
export const POST_PRE_MING_P27 = new Set([
  'Q9903', // Ming
  'Q8733', // Qing
  'Q134261', // ROC
  'Q148', // PRC
]);

export const PRE_MING_PERIOD = {
  id: 'pre-ming',
  packSlug: 'pre-ming',
  labelZh: '明前',
  labelEn: 'pre-Ming China',
  startYear: -221,
  endYear: PRE_MING_END_YEAR,
};

/**
 * @param {typeof import('./dynasties.json').dynasties} dynasties
 */
export function preMingDynasties(dynasties) {
  return dynasties.filter(
    (d) => d.endYear <= PRE_MING_END_YEAR && !POST_PRE_MING_P27.has(d.qid),
  );
}

/**
 * @param {typeof import('./dynasties.json').dynasties} dynasties
 */
export function preMingMembershipSpec(dynasties) {
  const preMing = preMingDynasties(dynasties);
  const preMingDynastyQids = preMing.map((d) => d.qid);
  const qidToDynasty = new Map(preMing.map((d) => [d.qid, d]));
  /** Prefer narrower periods when multiple P27 match (Northern Song before Song). */
  const bySpecificity = [...preMing].sort(
    (a, b) => a.endYear - a.startYear - (b.endYear - b.startYear),
  );
  return {
    preMingEndYear: PRE_MING_END_YEAR,
    preMingDynasties: preMing,
    preMingDynastyQids,
    preMingDynastyQidSet: new Set(preMingDynastyQids),
    qidToDynasty,
    bySpecificity,
  };
}

/**
 * @param {{ birthYear?: number, deathYear?: number, endYear?: number }} opts
 */
export function personYearsOverlapPreMing(opts, endYear = PRE_MING_END_YEAR) {
  const birth = opts.birthYear;
  const death = opts.deathYear ?? opts.endYear;
  if (death != null && death <= endYear) return true;
  if (death == null && birth != null && birth <= endYear) return true;
  return false;
}

/**
 * @param {{ p27?: string[], p2348?: string[] }} raw
 * @param {ReturnType<typeof preMingMembershipSpec>} spec
 */
export function rawPersonHasPreMingAuthority(raw, spec) {
  if ((raw.p27 ?? []).some((q) => spec.preMingDynastyQidSet.has(q))) return true;
  if ((raw.p2348 ?? []).some((q) => spec.preMingDynastyQidSet.has(q))) return true;
  return false;
}

/**
 * @param {{ p27?: string[], p2348?: string[], birthYear?: number, deathYear?: number }} raw
 * @param {ReturnType<typeof preMingMembershipSpec>} spec
 */
export function rawPersonMatchesPreMing(raw, spec) {
  const p27 = raw.p27 ?? [];
  if (
    p27.length > 0 &&
    p27.every((q) => POST_PRE_MING_P27.has(q)) &&
    !personYearsOverlapPreMing(raw, spec.preMingEndYear)
  ) {
    return false;
  }

  if (rawPersonHasPreMingAuthority(raw, spec)) return true;
  return personYearsOverlapPreMing(raw, spec.preMingEndYear);
}

/**
 * Extract gate — broader than compile: any pre-Ming authority signal or dated ≤ end year.
 *
 * @param {{ p27?: string[], p2348?: string[], birthYear?: number, deathYear?: number }} raw
 * @param {ReturnType<typeof preMingMembershipSpec>} spec
 */
export function rawPersonMatchesPreMingExtract(raw, spec) {
  if (rawPersonHasPreMingAuthority(raw, spec)) return true;
  return personYearsOverlapPreMing(raw, spec.preMingEndYear);
}

/**
 * @param {{ p27?: string[], p2348?: string[] }} raw
 * @param {ReturnType<typeof preMingMembershipSpec>} spec
 */
export function inferPreMingDynasty(raw, spec) {
  for (const d of spec.bySpecificity) {
    if ((raw.p27 ?? []).includes(d.qid) || (raw.p2348 ?? []).includes(d.qid)) return d;
  }
  return PRE_MING_PERIOD;
}
