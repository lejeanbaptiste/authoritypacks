/**
 * Procedural translations for compound offices linked by Norbert parentOf
 * relations (e.g. 太子 + 右庶子 → 太子右庶子).
 *
 * English template (v1): "{Remainder} of the {Parent}" — reliable for
 * household/staff compounds under allowlisted parents. Ministry-style
 * compounds and ambiguous short parents are left for the LLM.
 *
 * Uses only packs/norbert/office-relations.ndjson parentOf edges (name
 * hierarchy). CBDB's office-type-tree parentOf links are not used here.
 */
import { readNdjson } from '../shared/ndjson.mjs';

const CJK_ONLY = /^[\u4e00-\u9fff]+$/;

/**
 * Parents where "{role} of the {parent}" matches Hucker-style English.
 * Expand only after review confirms the template still holds.
 */
export const ALLOWED_PARENTS = new Set(['太子', '公主', '親王']);

/** Stable parent glosses for the allowlist (avoid placeholder CBDB rows). */
export const DEFAULT_PARENT_GLOSS = {
  太子: 'Heir Apparent',
  公主: 'Imperial Princess',
  親王: 'Prince',
};

/** Remainder must be at least this many characters (drops 僕, 宮, …). */
export const MIN_REMAINDER_LEN = 2;

/**
 * @param {string | null | undefined} raw
 * @returns {string | null}
 */
export function cleanOfficeGloss(raw) {
  if (!raw || /not yet translated/i.test(raw)) return null;
  const gloss = String(raw).replace(/\(Hucker\)/gi, '').trim();
  return gloss || null;
}

/**
 * Index office translations by headword for remainder lookup.
 * Prefer dynasty-specific glosses when the target dynasty is known.
 *
 * @param {Array} offices CBDB and/or Norbert office rows
 * @returns {Map<string, Map<string, string>>} zh -> dynasty -> gloss
 */
export function buildOfficeGlossIndex(offices) {
  /** @type {Map<string, Map<string, string>>} */
  const index = new Map();
  for (const row of offices) {
    const zh = String(row.primaryName ?? '').normalize('NFKC').trim();
    const gloss = cleanOfficeGloss(row.metadata?.translation);
    if (!zh || !gloss) continue;
    if (!index.has(zh)) index.set(zh, new Map());
    const dynasty = row.metadata?.dynasty ?? '';
    // First wins per (zh, dynasty); CBDB usually listed before Norbert.
    if (!index.get(zh).has(dynasty)) index.get(zh).set(dynasty, gloss);
  }
  return index;
}

/**
 * @param {string} zh
 * @param {string | null | undefined} dynasty
 * @param {Map<string, Map<string, string>>} glossIndex
 * @returns {string | null}
 */
export function resolveOfficeGloss(zh, dynasty, glossIndex) {
  const byDynasty = glossIndex.get(zh);
  if (!byDynasty?.size) return null;
  if (byDynasty.has(dynasty ?? '')) return byDynasty.get(dynasty ?? '');
  if (byDynasty.has('')) return byDynasty.get('');
  // Unique gloss across dynasties → safe to reuse.
  const unique = new Set(byDynasty.values());
  if (unique.size === 1) return [...unique][0];
  return null;
}

/**
 * Build child-name → parentOf link index from Norbert relations.
 *
 * @param {Array} relations office-relations rows
 * @returns {Map<string, { parent: string, child: string, relationId: string }>}
 */
export function indexParentOfByChild(relations) {
  /** @type {Map<string, { parent: string, child: string, relationId: string }>} */
  const byChild = new Map();
  for (const row of relations) {
    if (row.type !== 'parentOf') continue;
    const labels = row.evidence?.labels;
    const parent = String(labels?.[0] ?? '').normalize('NFKC').trim();
    const child = String(labels?.[1] ?? '').normalize('NFKC').trim();
    if (!parent || !child) continue;
    if (!ALLOWED_PARENTS.has(parent)) continue;
    if (!child.startsWith(parent) || child.length <= parent.length) continue;
    const rem = child.slice(parent.length);
    if (rem.length < MIN_REMAINDER_LEN || !CJK_ONLY.test(rem)) continue;
    // First link wins if duplicates appear.
    if (!byChild.has(child)) {
      byChild.set(child, { parent, child, relationId: row.id });
    }
  }
  return byChild;
}

/**
 * @param {string} path
 * @returns {Map<string, { parent: string, child: string, relationId: string }>}
 */
export function loadParentOfIndex(path) {
  return indexParentOfByChild(readNdjson(path));
}

/**
 * @param {string} remainderGloss
 * @param {string} parentGloss
 */
export function composeParentOfTranslation(remainderGloss, parentGloss) {
  return `${remainderGloss} of the ${parentGloss}`;
}

/**
 * @param {object} target
 * @param {Map<string, { parent: string, child: string, relationId: string }>} parentOfByChild
 * @param {Map<string, Map<string, string>>} glossIndex
 * @returns {object | null}
 */
export function tryParentOfTranslation(target, parentOfByChild, glossIndex) {
  const zh = String(target.zh ?? '').normalize('NFKC').trim();
  const link = parentOfByChild.get(zh);
  if (!link) return null;

  const rem = zh.slice(link.parent.length);
  const parentGloss = DEFAULT_PARENT_GLOSS[link.parent];
  if (!parentGloss) return null;

  const remGloss = resolveOfficeGloss(rem, target.dynasty, glossIndex);
  if (!remGloss) return null;

  // Remainder gloss already embeds the parent phrase — composing would double it.
  if (remGloss.toLowerCase().includes(parentGloss.toLowerCase())) return null;

  const gloss = composeParentOfTranslation(remGloss, parentGloss);
  return {
    gloss,
    rule: 'parentOf',
    parent: link.parent,
    remainder: rem,
    parentGloss,
    remainderGloss: remGloss,
    relationId: link.relationId,
  };
}

/**
 * @param {Array} targets
 * @param {Map} parentOfByChild
 * @param {Map} glossIndex
 */
export function partitionParentOfTargets(targets, parentOfByChild, glossIndex) {
  /** @type {Array} */
  const procedural = [];
  /** @type {Array} */
  const llm = [];
  for (const target of targets) {
    const proc = tryParentOfTranslation(target, parentOfByChild, glossIndex);
    if (proc) procedural.push({ target, procedural: proc });
    else llm.push(target);
  }
  return { procedural, llm };
}
