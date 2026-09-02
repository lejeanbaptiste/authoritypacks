/**
 * Collapse byte-identical CBDB pre-Han office rows that differ only by c_office_id.
 *
 * CBDB sometimes carries several ids for the same office string, type node, note,
 * and translation within the coarse 漢前 dynasty bucket. The pack keeps one
 * canonical row (lowest id) and records the rest in office-concordance.ndjson.
 *
 * Only rows whose source dynasty is 漢前 are considered; later-dynasty homonyms
 * with empty notes are left untouched.
 */

/** @typedef {import('../shared/types.mjs').AuthorityCandidate} AuthorityCandidate */

const PRE_HAN_SOURCE_DYNASTY = '漢前';

/**
 * @param {AuthorityCandidate} office
 */
function officeDedupSignature(office) {
  const meta = office.metadata ?? {};
  const typeIds = [...(meta.officeTypeIds ?? [])].sort();
  return JSON.stringify({
    primaryName: office.primaryName,
    note: meta.note ?? null,
    translation: meta.translation ?? null,
    officeTypeIds: typeIds,
  });
}

/**
 * @param {AuthorityCandidate} office
 */
function isPreHanSourceOffice(office) {
  return office.metadata?.sourceDynasty === PRE_HAN_SOURCE_DYNASTY;
}

/**
 * @param {AuthorityCandidate[]} offices
 * @returns {{ offices: AuthorityCandidate[], concordance: { canonicalId: string, mergedFromId: string }[] }}
 */
export function collapseCbdbOfficeDuplicates(offices) {
  /** @type {Map<string, AuthorityCandidate[]>} */
  const preHanGroups = new Map();
  /** @type {AuthorityCandidate[]} */
  const otherOffices = [];

  for (const office of offices) {
    if (!isPreHanSourceOffice(office)) {
      otherOffices.push(office);
      continue;
    }
    const key = officeDedupSignature(office);
    const list = preHanGroups.get(key) ?? [];
    list.push(office);
    preHanGroups.set(key, list);
  }

  /** @type {AuthorityCandidate[]} */
  const kept = [...otherOffices];
  /** @type {{ canonicalId: string, mergedFromId: string }[]} */
  const concordance = [];

  for (const group of preHanGroups.values()) {
    if (group.length === 1) {
      kept.push(group[0]);
      continue;
    }
    const sorted = [...group].sort(
      (a, b) => Number(a.authorityId) - Number(b.authorityId),
    );
    const canonical = sorted[0];
    kept.push(canonical);
    for (const duplicate of sorted.slice(1)) {
      concordance.push({
        canonicalId: canonical.authorityId,
        mergedFromId: duplicate.authorityId,
      });
    }
  }

  return { offices: kept, concordance };
}
