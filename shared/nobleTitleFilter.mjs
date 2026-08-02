import fs from 'node:fs';

import { normalizeSurface } from './normalize.mjs';

/** @typedef {import('./types.mjs').AuthorityCandidate} AuthorityCandidate */

const HEADER_KEYS = new Set(['schemaVersion', 'note']);

const clean = (value) => (value == null ? undefined : normalizeSurface(String(value)) || undefined);

/**
 * Read the reviewed include. Invalid lines are rejected loudly: a malformed
 * review decision must never broaden the filter silently.
 * @param {string} filePath
 */
export function loadApprovedNobleTitleRules(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const rules = [];
  for (const [index, raw] of fs.readFileSync(filePath, 'utf8').split(/\r?\n/).entries()) {
    if (!raw.trim()) continue;
    let row;
    try {
      row = JSON.parse(raw);
    } catch (error) {
      throw new Error(`Invalid noble-title include JSON at ${filePath}:${index + 1}: ${error.message}`);
    }
    if (Object.keys(row).some((key) => HEADER_KEYS.has(key)) && !row.surface) continue;
    const surface = clean(row.surface);
    const action = row.action;
    const components = row.components ?? {};
    const roleName = clean(components.roleName);
    const personName = clean(components.personName);
    if (!surface || !['nobleTitle', 'personWrapper'].includes(action) || !roleName) {
      throw new Error(`Invalid noble-title include record at ${filePath}:${index + 1}`);
    }
    if (surface.length < 2 || ['王', '后', '帝'].includes(surface)) {
      throw new Error(`Unsafe noble-title include surface at ${filePath}:${index + 1}: ${surface}`);
    }
    if (action === 'personWrapper' && !personName) {
      throw new Error(`personWrapper needs components.personName at ${filePath}:${index + 1}`);
    }
    rules.push({
      id: clean(row.id) ?? `include:${index + 1}`,
      surface,
      action,
      sources: Array.isArray(row.sources) ? row.sources.map((source) => String(source).trim().toUpperCase()).filter(Boolean) : undefined,
      components: {
        ...(clean(components.dynasty) ? { dynasty: clean(components.dynasty) } : {}),
        ...(clean(components.fief) ? { fief: clean(components.fief) } : {}),
        roleName,
        ...(clean(components.posthumousName) ? { posthumousName: clean(components.posthumousName) } : {}),
        ...(clean(components.posthumousNameAbbr) ? { posthumousNameAbbr: clean(components.posthumousNameAbbr) } : {}),
        ...(personName ? { personName } : {}),
      },
      note: clean(row.note),
    });
  }
  return rules;
}

export function indexApprovedNobleTitleRules(rules) {
  const index = new Map();
  for (const rule of rules) {
    if (index.has(rule.surface)) throw new Error(`Duplicate noble-title include surface: ${rule.surface}`);
    index.set(rule.surface, rule);
  }
  return index;
}

function ruleApplies(rule, candidate) {
  return !rule.sources?.length || rule.sources.includes(String(candidate.source ?? '').trim().toUpperCase());
}

/** Return the exact reviewed rule for this source/surface, if any. */
export function approvedNobleTitleRule(index, candidate, surface) {
  const rule = index.get(clean(surface));
  return rule && ruleApplies(rule, candidate) ? rule : undefined;
}

/**
 * Remove only exact approved title surfaces from name fields. Primary/display
 * headwords deliberately remain: they are source bibliographic labels, not
 * assertions that the text is a persName.
 */
export function filterApprovedNobleTitlesFromCandidate(candidate, ruleIndex) {
  if (!['person', 'office'].includes(candidate.kind)) return candidate;
  const remove = (surface) => Boolean(approvedNobleTitleRule(ruleIndex, candidate, surface));
  const names = candidate.names?.filter((entry) => !remove(entry.text));
  const searchStrings = candidate.searchStrings.filter((surface) => !remove(surface));
  if (searchStrings.length === candidate.searchStrings.length && names?.length === candidate.names?.length) return candidate;
  return {
    ...candidate,
    searchStrings,
    ...(names ? { names } : {}),
    metadata: {
      ...candidate.metadata,
      nobleTitleFilter: {
        filteredSurfaces: candidate.searchStrings.filter(remove),
      },
    },
  };
}

/** Make one structural matcher record per reviewed decision/source hit. */
export function nobleTitleCandidatesFromApprovedMatches(matches) {
  const out = [];
  const seen = new Set();
  for (const { candidate, surface, rule } of matches) {
    const key = `${candidate.source}\0${candidate.authorityId}\0${surface}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const title = rule.components;
    const metadata = {
      isNobleTitle: true,
      teiTag: rule.action === 'nobleTitle' ? 'nobleTitle' : undefined,
      dynasty: title.dynasty,
      nobleTitle: {
        ...(title.fief ? { fief: title.fief } : {}),
        roleName: title.roleName,
        ...(title.posthumousName ? { posthumousName: title.posthumousName } : {}),
        ...(title.posthumousNameAbbr ? { posthumousNameAbbr: title.posthumousNameAbbr } : {}),
      },
      nobleTitleFilter: { ruleId: rule.id, source: candidate.source, authorityId: candidate.authorityId },
    };
    if (rule.action === 'personWrapper') {
      metadata.wrapper = {
        personId: candidate.authorityId,
        titleRowId: rule.id,
        components: {
          ...(title.dynasty ? { nationality: title.dynasty } : {}),
          ...(title.fief ? { fief: title.fief } : {}),
          ...(title.posthumousName ? { posthumousName: title.posthumousName } : {}),
          ...(title.posthumousNameAbbr ? { posthumousNameAbbr: title.posthumousNameAbbr } : {}),
          roleName: title.roleName,
          persName: title.personName,
        },
      };
    }
    out.push({
      source: `Noble title filter (${candidate.source})`,
      authorityId: `noble-title-filter:${rule.id}:${candidate.authorityId}`,
      kind: 'person',
      primaryName: surface,
      displayName: surface,
      searchStrings: [surface],
      metadata,
    });
  }
  return out;
}

/** Filter a complete pack and collect the structural replacements. */
export function applyApprovedNobleTitleFilter(candidates, ruleIndex) {
  const matches = [];
  const filtered = candidates.map((candidate) => {
    for (const surface of [...candidate.searchStrings, ...(candidate.names ?? []).map((name) => name.text)]) {
      const rule = approvedNobleTitleRule(ruleIndex, candidate, surface);
      if (rule) matches.push({ candidate, surface: clean(surface), rule });
    }
    return filterApprovedNobleTitlesFromCandidate(candidate, ruleIndex);
  });
  return { candidates: filtered.filter((candidate) => candidate.searchStrings.length > 0), matches };
}
