/**
 * Return dynasty labels whose ranges are compatible with a person's known
 * dates. Unknown dates/ranges are retained rather than discarded.
 * @param {{ label: string, startYear?: number|null, endYear?: number|null }[]} candidates
 * @param {{ startYear?: number|null, endYear?: number|null }} dates
 * @returns {string[]}
 */
export function nationalityFromDynasties(candidates, dates = {}) {
  const personStart = dates.startYear ?? -Infinity;
  const personEnd = dates.endYear ?? Infinity;
  const labels = new Set();
  for (const candidate of candidates) {
    if (!candidate?.label || !String(candidate.label).trim()) continue;
    const start = candidate.startYear ?? -Infinity;
    const end = candidate.endYear ?? Infinity;
    if (start <= personEnd && end >= personStart) labels.add(String(candidate.label).trim());
  }
  return [...labels];
}
