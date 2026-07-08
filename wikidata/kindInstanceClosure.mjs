/**
 * P31/P279* instance-of closure for Wikidata kind matching.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { claimEntityIds } from './entityParse.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CLOSURE_PATH = path.join(__dirname, 'kind-instance-closure.json');

/**
 * @typedef {{
 *   instanceOfRoots: string[];
 *   instanceOfClosure: string[];
 *   excludeInstanceOfRoots?: string[];
 *   excludeInstanceOfClosure?: string[];
 * }} KindClosureEntry
 */

/** @typedef {{ version: number, builtAt: string, kinds: Record<string, KindClosureEntry> }} KindClosureDoc */

/** @type {KindClosureDoc | null | undefined} */
let cachedDoc;
/** @type {string | undefined} */
let closurePathOverride;

/** @param {string | undefined} closurePath */
export function setKindClosurePath(closurePath) {
  closurePathOverride = closurePath;
  cachedDoc = undefined;
}

function resolveClosurePath() {
  return closurePathOverride ?? DEFAULT_CLOSURE_PATH;
}

/** @param {string} [closurePath] */
export function loadKindInstanceClosure(closurePath) {
  const resolved = closurePath ?? resolveClosurePath();
  if (cachedDoc !== undefined && !closurePath) return cachedDoc;
  if (!fs.existsSync(resolved)) {
    cachedDoc = null;
    return null;
  }
  const doc = /** @type {KindClosureDoc} */ (JSON.parse(fs.readFileSync(resolved, 'utf8')));
  if (!closurePath) cachedDoc = doc;
  return doc;
}

/** Reset module cache (tests). */
export function resetKindInstanceClosureCache() {
  cachedDoc = undefined;
  closurePathOverride = undefined;
}

/** @param {string} kindId @param {string} [closurePath] */
export function kindClosureEntry(kindId, closurePath) {
  const doc = loadKindInstanceClosure(closurePath);
  return doc?.kinds?.[kindId] ?? null;
}

/**
 * Match entity P31 against expanded instance-of closure (P31/P279* semantics).
 * Falls back to direct root match when no closure file is loaded.
 *
 * @param {unknown} entity
 * @param {{ instanceOf: string[], excludeInstanceOf?: string[] }} spec
 * @param {KindClosureEntry | null} [closure]
 */
export function entityInstanceMatches(entity, spec, closure) {
  const p31 = claimEntityIds(entity, 'P31');
  return entityP31MatchesSpec(p31, spec, closure);
}

/**
 * @param {string[]} p31
 * @param {{ instanceOf: string[], excludeInstanceOf?: string[] }} spec
 * @param {KindClosureEntry | null} [closure]
 */
export function entityP31MatchesSpec(p31, spec, closure) {
  const include = closure?.instanceOfClosure?.length
    ? closure.instanceOfClosure
    : spec.instanceOf;
  const exclude = closure?.excludeInstanceOfClosure?.length
    ? closure.excludeInstanceOfClosure
    : (spec.excludeInstanceOf ?? []);

  const includeSet = new Set(include);
  const excludeSet = new Set(exclude);

  if (!p31.some((qid) => includeSet.has(qid))) return false;
  if (p31.some((qid) => excludeSet.has(qid))) return false;
  return true;
}
