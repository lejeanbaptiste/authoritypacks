/**
 * Shared source-preserving office graph records.
 *
 * Office entities remain AuthorityCandidates for tagging. These records carry
 * the structure around them without forcing category nodes into the tag bomb.
 */

/**
 * @typedef {'parentOf' | 'belongsTo' | 'contextOf'} OfficeRelationType
 */

/**
 * @typedef {Object} OfficeRelation
 * @property {string} id
 * @property {OfficeRelationType} type
 * @property {string} subject
 * @property {string} object
 * @property {string} source
 * @property {'asserted'|'inferred'} confidence
 * @property {{ rule: string, table?: string, sourceIds?: string[], labels?: string[] }} evidence
 */

/** @param {string} source @param {string | number} id */
export function officeEntityId(source, id) {
  const bare = String(id).trim().replace(/^(person|office|place)[-:]/i, '');
  return `${String(source).trim().toLowerCase()}:office:${bare}`;
}

/** @param {string | number} id */
export function cbdbOfficeTypeId(id) {
  return `cbdb:office-type:${id}`;
}

/**
 * Resolve explicit Norbert parent strings to unique office rows.
 * Place parents are deliberately excluded: they are tagging context, not an
 * office hierarchy assertion.
 *
 * @param {import('./types.mjs').AuthorityCandidate[]} offices
 * @returns {OfficeRelation[]}
 */
export function inferNorbertSourceRelations(offices) {
  /** @type {Map<string, import('./types.mjs').AuthorityCandidate[]>} */
  const byName = new Map();
  for (const office of offices) {
    const list = byName.get(office.primaryName) ?? [];
    list.push(office);
    byName.set(office.primaryName, list);
  }

  /** @type {OfficeRelation[]} */
  const relations = [];
  for (const child of offices) {
    const parentString = child.metadata?.parentString?.trim();
    if (!parentString || child.metadata?.parentIsSite) continue;
    const matches = (byName.get(parentString) ?? []).filter(
      (parent) => parent.authorityId !== child.authorityId,
    );
    if (matches.length !== 1) continue;
    const parent = matches[0];
    const parentBare = String(parent.authorityId).replace(/^(person|office|place)[-:]/i, '');
    const childBare = String(child.authorityId).replace(/^(person|office|place)[-:]/i, '');
    child.metadata.parentOffice = {
      source: parent.source,
      authorityId: parent.authorityId,
      entityId:
        parent.metadata?.canonicalEntityId
        ?? parent.metadata?.entityId
        ?? officeEntityId('norbert', parentBare),
      name: parent.primaryName,
    };
    relations.push({
      id: `norbert:parent:${parentBare}:${childBare}`,
      type: 'parentOf',
      subject: parent.metadata?.canonicalEntityId ?? parent.metadata?.entityId
        ?? officeEntityId('norbert', parentBare),
      object: child.metadata?.canonicalEntityId ?? child.metadata?.entityId
        ?? officeEntityId('norbert', childBare),
      source: 'Norbert',
      confidence: 'inferred',
      evidence: {
        rule: 'explicit-parent-string',
        table: 'office',
        sourceIds: [parentBare, childBare],
        labels: [parent.primaryName, child.primaryName],
      },
    });
  }
  return relations;
}

export {};
