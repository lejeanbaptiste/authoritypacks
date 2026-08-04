#!/usr/bin/env node
/** Tiered Norbert person concordances against CBDB / DILA / Wikidata packs. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readNdjson, writeNdjson } from '../shared/ndjson.mjs';
import {
  RULER_RANKS,
  STYLE_TYPES,
  SEP,
  anyDynastyCompatible,
  attachNobleTitlesFromWrappers,
  barePersonId,
  concordanceRow,
  dynastyLabelsOf,
  dynastyLookupKeys,
  isPreTangPerson,
  keyPart,
  namesOfTypes,
  normalizeSourceMap,
  personalNameBag,
  posthumousLookupKeys,
  posthumousNameBag,
  prepareSurnameList,
  resolveFamilyName,
  splitFamilyGiven,
  stylesMatch,
  templeNameBag,
} from './concordanceHelpers.mjs';

/**
 * Keep only matches that are unique per Norbert person + source.
 * Ambiguous homonyms (two CBDB hits for the same Norbert id) are dropped.
 * When several rows name the same target, keep the first (tier order).
 *
 * @param {any[]} rows
 * @returns {any[]}
 */
export function uniqueConcordanceRows(rows) {
  /** @type {Map<string, any[]>} */
  const byKey = new Map();
  for (const row of rows) {
    const norbertId = row.metadata?.norbert?.authorityId;
    const source = row.metadata?.matched?.source;
    if (norbertId == null || !source) continue;
    const key = `${norbertId}${SEP}${source}`;
    const list = byKey.get(key) ?? [];
    list.push(row);
    byKey.set(key, list);
  }
  /** @type {any[]} */
  const out = [];
  for (const list of byKey.values()) {
    const ids = new Set(list.map((row) => String(row.metadata.matched.authorityId)));
    if (ids.size !== 1) continue;
    out.push(list[0]);
  }
  return out;
}

/**
 * Map unique concordance rows → Norbert id → { cbdb?, wikidata?, … }.
 * @param {any[]} rows
 * @returns {Map<string, Record<string, string>>}
 */
export function concordanceIdnosByNorbertId(rows) {
  /** @type {Map<string, Record<string, string>>} */
  const out = new Map();
  for (const row of uniqueConcordanceRows(rows)) {
    const norbertId = String(row.metadata.norbert.authorityId);
    const source = String(row.metadata.matched.source).toLowerCase();
    const authorityId = String(row.metadata.matched.authorityId);
    const bag = out.get(norbertId) ?? {};
    bag[source] = authorityId;
    out.set(norbertId, bag);
  }
  return out;
}

/**
 * Load all Chinese-script Wikidata person packs under packs/wikidata.
 * @param {string} wikidataRoot
 * @returns {any[]}
 */
export function loadWikidataZhHantPersons(wikidataRoot) {
  if (!fs.existsSync(wikidataRoot)) return [];
  const people = [];
  for (const entry of fs.readdirSync(wikidataRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('person-zh-hant-')) continue;
    const file = path.join(wikidataRoot, entry.name, 'persons.ndjson');
    if (!fs.existsSync(file)) continue;
    for (const person of readNdjson(file)) people.push(person);
  }
  return people;
}

/**
 * @param {any} person
 */
function personStyles(person) {
  return namesOfTypes(person, STYLE_TYPES);
}

/**
 * Index people by each personal-name key.
 * @param {any[]} people
 */
function indexByPersonalName(people) {
  /** @type {Map<string, any[]>} */
  const index = new Map();
  for (const person of people) {
    for (const name of personalNameBag(person)) {
      const list = index.get(name) ?? [];
      list.push(person);
      index.set(name, list);
    }
  }
  return index;
}

/**
 * @param {any[]} people
 * @param {(p: any) => boolean} [filter]
 */
function indexByFamilyDynastyTemple(people, filter) {
  /** @type {Map<string, any[]>} */
  const index = new Map();
  for (const person of people) {
    if (filter && !filter(person)) continue;
    const families = new Set();
    const familyHit = resolveFamilyName(person, []);
    if (familyHit) families.add(familyHit.family);
    for (const name of personalNameBag(person)) {
      const split = splitFamilyGiven(name, []);
      if (split) families.add(split.family);
    }
    /** @type {Set<string>} */
    const dynKeys = new Set();
    for (const dynasty of dynastyLabelsOf(person)) {
      for (const key of dynastyLookupKeys(dynasty)) dynKeys.add(key);
    }
    const temples = templeNameBag(person);
    for (const family of families) {
      for (const dynasty of dynKeys) {
        for (const temple of temples) {
          const key = `${family}${SEP}${dynasty}${SEP}${temple}`;
          const list = index.get(key) ?? [];
          list.push(person);
          index.set(key, list);
        }
      }
    }
  }
  return index;
}

/**
 * @param {any[]} people
 */
function indexByFamilyDynastyPosthumous(people) {
  /** @type {Map<string, any[]>} */
  const index = new Map();
  for (const person of people) {
    const families = new Set();
    const familyHit = resolveFamilyName(person, []);
    if (familyHit) families.add(familyHit.family);
    for (const name of personalNameBag(person)) {
      const split = splitFamilyGiven(name, []);
      if (split) families.add(split.family);
    }
    /** @type {Set<string>} */
    const dynKeys = new Set();
    for (const dynasty of dynastyLabelsOf(person)) {
      for (const key of dynastyLookupKeys(dynasty)) dynKeys.add(key);
    }
    /** @type {Set<string>} */
    const postKeys = new Set();
    for (const pn of posthumousNameBag(person)) {
      for (const key of posthumousLookupKeys(pn)) postKeys.add(key);
    }
    for (const family of families) {
      for (const dynasty of dynKeys) {
        for (const pn of postKeys) {
          const key = `${family}${SEP}${dynasty}${SEP}${pn}`;
          const list = index.get(key) ?? [];
          list.push(person);
          index.set(key, list);
        }
      }
    }
  }
  return index;
}

/**
 * @param {any} norbertPerson
 * @param {any} match
 * @param {string} source
 * @param {string} matchRule
 * @param {Record<string, unknown>} evidence
 */
function pushCandidate(bucket, norbertPerson, match, source, matchRule, evidence) {
  const norbertId = barePersonId(norbertPerson.authorityId);
  bucket.push(
    concordanceRow(norbertId, source, match.authorityId, matchRule, evidence, norbertPerson, match),
  );
}

/**
 * Tier 1A — primary/personal + 字 + any dynasty compatible.
 * @param {any[]} norbert
 * @param {Record<string, any[]>} sources
 * @param {{ accepted: any[], review: any[] }} out
 */
function runTier1A(norbert, sources, out) {
  for (const [source, people] of Object.entries(sources)) {
    const index = indexByPersonalName(people);
    for (const person of norbert) {
      const dynasties = dynastyLabelsOf(person);
      const styles = personStyles(person);
      if (!dynasties.length || !styles.length) continue;
      const names = personalNameBag(person);
      if (!names.length) continue;

      /** @type {Map<string, any>} */
      const hits = new Map();
      for (const name of names) {
        for (const cand of index.get(name) ?? []) {
          const candDyn = dynastyLabelsOf(cand);
          if (!candDyn.some((d) => anyDynastyCompatible(dynasties, d))) continue;
          const candStyles = personStyles(cand);
          const styleHit = styles.find((ns) => candStyles.some((ms) => stylesMatch(ns, ms)));
          if (!styleHit) continue;
          hits.set(String(cand.authorityId), { cand, styleHit });
        }
      }
      if (hits.size === 1) {
        const { cand, styleHit } = [...hits.values()][0];
        pushCandidate(out.accepted, person, cand, source, 'tier1a-primary+style+dynasty', {
          tier: '1A',
          styleName: styleHit,
          dynasties,
        });
      } else if (hits.size > 1) {
        for (const { cand, styleHit } of hits.values()) {
          pushCandidate(out.review, person, cand, source, 'tier1a-primary+style+dynasty', {
            tier: '1A',
            styleName: styleHit,
            dynasties,
            reason: 'ambiguous',
          });
        }
      }
    }
  }
}

/**
 * Tier 1B — 姓+名+字, no dynasty → pre-Tang targets only.
 * @param {any[]} norbert
 * @param {Record<string, any[]>} sources
 * @param {string[]} surnames
 * @param {{ accepted: any[], review: any[] }} out
 */
function runTier1B(norbert, sources, surnames, out) {
  const targets = ['cbdb', 'wikidata'];
  for (const source of targets) {
    const people = (sources[source] ?? []).filter(isPreTangPerson);
    const index = indexByPersonalName(people);
    for (const person of norbert) {
      if (dynastyLabelsOf(person).length) continue;
      let family = namesOfTypes(person, new Set(['family', '姓']))[0];
      let given = namesOfTypes(person, new Set(['given', '名']))[0];
      let familySource = 'typed';
      const styles = personStyles(person);
      if ((!family || !given) && styles.length) {
        const resolved = resolveFamilyName(person, surnames);
        const personal = personalNameBag(person)[0];
        if (resolved && personal?.startsWith(resolved.family)) {
          family = resolved.family;
          given = personal.slice(family.length);
          familySource = resolved.familySource;
        }
      }
      if (!family || !given || !styles.length) continue;
      const personal = `${family}${given}`;

      /** @type {Map<string, any>} */
      const hits = new Map();
      for (const cand of index.get(personal) ?? []) {
        const candStyles = personStyles(cand);
        const styleHit = styles.find((ns) => candStyles.some((ms) => stylesMatch(ns, ms)));
        if (!styleHit) continue;
        // Also require family agreement when candidate exposes family.
        const candFamily = resolveFamilyName(cand, surnames);
        if (candFamily && candFamily.family !== family) continue;
        hits.set(String(cand.authorityId), { cand, styleHit });
      }
      if (hits.size === 1) {
        const { cand, styleHit } = [...hits.values()][0];
        pushCandidate(out.accepted, person, cand, source, 'tier1b-family+given+style-pre-tang', {
          tier: '1B',
          styleName: styleHit,
          family,
          given,
          familySource,
        });
      } else if (hits.size > 1) {
        for (const { cand, styleHit } of hits.values()) {
          pushCandidate(out.review, person, cand, source, 'tier1b-family+given+style-pre-tang', {
            tier: '1B',
            styleName: styleHit,
            family,
            given,
            familySource,
            reason: 'ambiguous',
          });
        }
      }
    }
  }
}

/**
 * Tier 1C — ruler ranks via temple or posthumous keys.
 * @param {any[]} norbert
 * @param {Record<string, any[]>} sources
 * @param {string[]} surnames
 * @param {{ accepted: any[], review: any[] }} out
 */
function runTier1C(norbert, sources, surnames, out) {
  for (const [source, people] of Object.entries(sources)) {
    const byTemple = indexByFamilyDynastyTemple(people);
    const byPosthumous = indexByFamilyDynastyPosthumous(people);

    for (const person of norbert) {
      const titles = (person.metadata?.nobleTitles ?? []).filter((t) =>
        RULER_RANKS.has(keyPart(t.roleName ?? t.rank)),
      );
      if (!titles.length) continue;

      const familyInfo = resolveFamilyName(person, surnames);
      if (!familyInfo) continue;
      const { family, familySource } = familyInfo;
      const personDynasties = dynastyLabelsOf(person);

      /** @type {Map<string, { cand: any, rule: string, evidence: Record<string, unknown> }>} */
      const hits = new Map();

      for (const title of titles) {
        const titleDynasties = [
          ...personDynasties,
          ...(title.dynasty ? [keyPart(title.dynasty)] : []),
        ].filter(Boolean);
        const temple = keyPart(title.temple ?? title.templeName);
        const posthumous = keyPart(title.posthumous ?? title.posthumousName);
        const role = keyPart(title.roleName ?? title.rank);

        if (temple) {
          for (const dynasty of titleDynasties) {
            for (const dynKey of dynastyLookupKeys(dynasty)) {
              const key = `${family}${SEP}${dynKey}${SEP}${temple}`;
              for (const cand of byTemple.get(key) ?? []) {
                hits.set(String(cand.authorityId), {
                  cand,
                  rule: 'tier1c-ruler-temple',
                  evidence: {
                    tier: '1C',
                    family,
                    familySource,
                    dynasty: dynKey,
                    temple,
                    role,
                  },
                });
              }
            }
          }
        }

        if (posthumous) {
          for (const dynasty of titleDynasties) {
            for (const dynKey of dynastyLookupKeys(dynasty)) {
              for (const pnKey of posthumousLookupKeys(posthumous)) {
                const key = `${family}${SEP}${dynKey}${SEP}${pnKey}`;
                for (const cand of byPosthumous.get(key) ?? []) {
                  if (hits.has(String(cand.authorityId))) continue;
                  hits.set(String(cand.authorityId), {
                    cand,
                    rule: 'tier1c-ruler-posthumous',
                    evidence: {
                      tier: '1C',
                      family,
                      familySource,
                      dynasty: dynKey,
                      posthumous: pnKey,
                      role,
                    },
                  });
                }
              }
            }
          }
        }
      }

      if (hits.size === 1) {
        const hit = [...hits.values()][0];
        pushCandidate(out.accepted, person, hit.cand, source, hit.rule, hit.evidence);
      } else if (hits.size > 1) {
        for (const hit of hits.values()) {
          pushCandidate(out.review, person, hit.cand, source, hit.rule, {
            ...hit.evidence,
            reason: 'ambiguous',
          });
        }
      }
    }
  }
}

/**
 * Tier 0 — expand accepted CBDB links via DILA idnos + Wikidata↔CBDB table.
 * @param {any[]} accepted
 * @param {Record<string, any[]>} sources
 * @param {{ wikidata: string, cbdb: string }[]} cbdbWikidata
 * @param {{ accepted: any[], review: any[] }} out
 */
function runTier0Expand(accepted, sources, cbdbWikidata, out) {
  /** @type {Map<string, string[]>} */
  const wdByCbdb = new Map();
  for (const row of cbdbWikidata) {
    if (!row?.cbdb || !row?.wikidata) continue;
    const list = wdByCbdb.get(String(row.cbdb)) ?? [];
    if (!list.includes(row.wikidata)) list.push(row.wikidata);
    wdByCbdb.set(String(row.cbdb), list);
  }

  /** @type {Map<string, any[]>} */
  const dilaByCbdb = new Map();
  for (const person of sources.dila ?? []) {
    const cbdb = person.metadata?.crosswalk?.cbdb;
    if (!cbdb) continue;
    const list = dilaByCbdb.get(String(cbdb)) ?? [];
    list.push(person);
    dilaByCbdb.set(String(cbdb), list);
  }

  const wikidataById = new Map((sources.wikidata ?? []).map((p) => [String(p.authorityId), p]));
  const cbdbById = new Map((sources.cbdb ?? []).map((p) => [String(p.authorityId), p]));
  const unique = uniqueConcordanceRows(accepted);

  for (const row of unique) {
    const source = String(row.metadata.matched.source).toLowerCase();
    if (source !== 'cbdb') continue;
    const cbdbId = String(row.metadata.matched.authorityId);
    const norbertMeta = row.metadata.norbert;
    const norbertPerson = {
      authorityId: norbertMeta.authorityId,
      primaryName: norbertMeta.primaryName,
    };

    const wdIds = wdByCbdb.get(cbdbId) ?? [];
    const cbdbPerson = cbdbById.get(cbdbId);
    const fromPack = cbdbPerson?.metadata?.crosswalk?.wikidata;
    const packList = Array.isArray(fromPack) ? fromPack : fromPack ? [fromPack] : [];
    const allWd = [...new Set([...wdIds, ...packList.map(String)])];
    if (allWd.length === 1) {
      const qid = allWd[0];
      const matched = wikidataById.get(qid) ?? { authorityId: qid, primaryName: qid };
      pushCandidate(out.accepted, norbertPerson, matched, 'wikidata', 'tier0-via-cbdb-wikidata', {
        tier: '0',
        via: { source: 'cbdb', authorityId: cbdbId },
      });
    } else if (allWd.length > 1) {
      for (const qid of allWd) {
        const matched = wikidataById.get(qid) ?? { authorityId: qid, primaryName: qid };
        pushCandidate(out.review, norbertPerson, matched, 'wikidata', 'tier0-via-cbdb-wikidata', {
          tier: '0',
          via: { source: 'cbdb', authorityId: cbdbId },
          reason: 'ambiguous',
        });
      }
    }

    const dilas = dilaByCbdb.get(cbdbId) ?? [];
    if (dilas.length === 1) {
      pushCandidate(out.accepted, norbertPerson, dilas[0], 'dila', 'tier0-via-cbdb-dila', {
        tier: '0',
        via: { source: 'cbdb', authorityId: cbdbId },
      });
    } else if (dilas.length > 1) {
      for (const d of dilas) {
        pushCandidate(out.review, norbertPerson, d, 'dila', 'tier0-via-cbdb-dila', {
          tier: '0',
          via: { source: 'cbdb', authorityId: cbdbId },
          reason: 'ambiguous',
        });
      }
    }
  }
}

/**
 * Tier 2 — soft personal-name + dynasty candidates for CSV review only.
 * @param {any[]} norbert
 * @param {Record<string, any[]>} sources
 * @param {Set<string>} alreadyLinked
 * @param {{ accepted: any[], review: any[] }} out
 */
function runTier2Review(norbert, sources, alreadyLinked, out) {
  for (const source of ['cbdb', 'wikidata', 'dila']) {
    const people = sources[source] ?? [];
    if (!people.length) continue;
    const index = indexByPersonalName(people);
    for (const person of norbert) {
      const norbertId = barePersonId(person.authorityId);
      if (alreadyLinked.has(`${norbertId}${SEP}${source}`)) continue;
      const dynasties = dynastyLabelsOf(person);
      const names = personalNameBag(person);
      if (!names.length || !dynasties.length) continue;

      /** @type {Map<string, { cand: any, score: number, shared: string }>} */
      const hits = new Map();
      for (const name of names) {
        for (const cand of index.get(name) ?? []) {
          const candDyn = dynastyLabelsOf(cand);
          if (!candDyn.some((d) => anyDynastyCompatible(dynasties, d))) continue;
          let score = 55; // personal + dynasty
          const shared = [name, `dynasty:${candDyn.join('|')}`];
          const styles = personStyles(person);
          const candStyles = personStyles(cand);
          if (styles.some((ns) => candStyles.some((ms) => stylesMatch(ns, ms)))) {
            score += 25;
            shared.push('style');
          }
          const temples = templeNameBag(person);
          const candTemples = templeNameBag(cand);
          if (temples.some((t) => candTemples.includes(t))) {
            score += 25;
            shared.push('temple');
          }
          const prev = hits.get(String(cand.authorityId));
          if (!prev || score > prev.score) {
            hits.set(String(cand.authorityId), { cand, score, shared: shared.join(';') });
          }
        }
      }
      const ranked = [...hits.values()].sort((a, b) => b.score - a.score).slice(0, 5);
      for (const hit of ranked) {
        pushCandidate(out.review, person, hit.cand, source, 'tier2-scored-review', {
          tier: '2',
          score: hit.score,
          shared: hit.shared,
          dynasties,
          reason: 'review-only',
        });
      }
    }
  }
}

/**
 * Full concordance run.
 * @param {any[]} norbert
 * @param {Record<string, any[]>} sources
 * @param {{
 *   wrappers?: any[],
 *   surnames?: string[],
 *   cbdbWikidata?: { wikidata: string, cbdb: string }[],
 *   includeTier2Review?: boolean,
 * }} [options]
 */
export function runNorbertPersonConcordance(norbert, sources, options = {}) {
  const people = attachNobleTitlesFromWrappers(
    norbert.map((p) => ({ ...p, metadata: { ...(p.metadata ?? {}) } })),
    options.wrappers ?? [],
  );
  const sourceMap = normalizeSourceMap(sources);
  const surnames = prepareSurnameList(options.surnames ?? []);
  /** @type {{ accepted: any[], review: any[] }} */
  const out = { accepted: [], review: [] };

  runTier1A(people, sourceMap, out);
  runTier1B(people, sourceMap, surnames, out);
  runTier1C(people, sourceMap, surnames, out);
  runTier0Expand(out.accepted, sourceMap, options.cbdbWikidata ?? [], out);

  const uniqueAccepted = uniqueConcordanceRows(out.accepted);
  const linked = new Set(
    uniqueAccepted.map(
      (row) => `${row.metadata.norbert.authorityId}${SEP}${row.metadata.matched.source}`,
    ),
  );

  if (options.includeTier2Review !== false) {
    runTier2Review(people, sourceMap, linked, out);
  }

  // Ambiguous tier1 rows already in review; also move non-unique accepted leftovers.
  const acceptedIds = new Set(uniqueAccepted.map((r) => r.authorityId));
  for (const row of out.accepted) {
    if (acceptedIds.has(row.authorityId)) continue;
    if (row.metadata.reason) continue;
    out.review.push({
      ...row,
      metadata: { ...row.metadata, reason: 'ambiguous' },
    });
  }

  return {
    accepted: uniqueAccepted,
    review: out.review,
    stats: {
      accepted: uniqueAccepted.length,
      review: out.review.length,
      byMatch: countBy(uniqueAccepted, (r) => r.metadata.match),
      reviewByReason: countBy(out.review, (r) => r.metadata.reason ?? 'n/a'),
    },
  };
}

/** @param {any[]} rows @param {(r: any) => string} keyFn */
function countBy(rows, keyFn) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const row of rows) {
    const key = keyFn(row);
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

/**
 * Backward-compatible: return unique accepted concordance rows.
 * @param {any[]} norbert
 * @param {Record<string, any[]>} sources
 * @param {Parameters<typeof runNorbertPersonConcordance>[2]} [options]
 */
export function buildNorbertConcordance(norbert, sources, options = {}) {
  // Preserve old triple-rule tests: when options omit wrappers/tier2 and callers
  // expect only 1A-style rows, still run the full pipeline (1B/1C simply no-op).
  const result = runNorbertPersonConcordance(norbert, sources, {
    includeTier2Review: false,
    ...options,
  });
  return result.accepted;
}

/**
 * @param {any[]} reviewRows
 * @returns {string}
 */
export function reviewRowsToCsv(reviewRows) {
  const header = [
    'norbert_id',
    'norbert_name',
    'candidate_source',
    'candidate_id',
    'candidate_name',
    'tier',
    'match_rule',
    'reason',
    'score',
    'shared',
    'dynasties',
    'style',
    'family',
    'temple',
    'posthumous',
    'family_source',
  ];
  const escape = (value) => {
    const text = value == null ? '' : String(value);
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };
  const lines = [header.join(',')];
  for (const row of reviewRows) {
    const md = row.metadata ?? {};
    lines.push(
      [
        md.norbert?.authorityId,
        md.norbert?.primaryName,
        md.matched?.source,
        md.matched?.authorityId,
        md.matched?.primaryName,
        md.tier,
        md.match,
        md.reason,
        md.score,
        md.shared,
        Array.isArray(md.dynasties) ? md.dynasties.join('|') : md.dynasty,
        md.styleName,
        md.family,
        md.temple,
        md.posthumous,
        md.familySource,
      ]
        .map(escape)
        .join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] ?? fallback : fallback;
}
function load(dir) {
  return readNdjson(path.join(dir, 'persons.ndjson'));
}
function loadJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const norbertDir = arg('--norbert');
  const out = arg('--out', 'packs/norbert/norbert-concordance.ndjson');
  const reviewOut = arg('--review-csv', 'reports/norbert-person-concordance-review.csv');
  if (!norbertDir) {
    throw new Error(
      'Usage: node norbert/concordance.mjs --norbert DIR [--cbdb DIR] [--dila DIR] [--wikidata DIR] [--out FILE] [--review-csv FILE]',
    );
  }
  const sources = {};
  for (const source of ['cbdb', 'dila']) {
    const dir = arg(`--${source}`);
    if (!dir) continue;
    const file = path.join(dir, 'persons.ndjson');
    if (!fs.existsSync(file)) {
      console.warn(`Skipping ${source}: no persons.ndjson at ${file}`);
      continue;
    }
    sources[source] = load(dir);
  }
  const wikidataDir = arg('--wikidata');
  if (wikidataDir) {
    const single = path.join(wikidataDir, 'persons.ndjson');
    if (fs.existsSync(single)) {
      sources.wikidata = load(wikidataDir);
    } else {
      sources.wikidata = loadWikidataZhHantPersons(wikidataDir);
      if (!sources.wikidata.length) {
        console.warn(`Skipping wikidata: no person-zh-hant-* packs under ${wikidataDir}`);
        delete sources.wikidata;
      }
    }
  }

  const wrappersPath = path.join(norbertDir, 'person-wrappers.ndjson');
  const surnamesPath = path.join(norbertDir, 'surnames.json');
  const cbdbWdPath = arg(
    '--cbdb-wikidata',
    'packs/wikidata/cbdb-wikidata-concordance.ndjson',
  );
  const surnamesJson = loadJson(surnamesPath, { surnames: [] });
  const wrappers = fs.existsSync(wrappersPath) ? readNdjson(wrappersPath) : [];
  const cbdbWikidata = fs.existsSync(cbdbWdPath) ? readNdjson(cbdbWdPath) : [];

  const result = runNorbertPersonConcordance(load(norbertDir), sources, {
    wrappers,
    surnames: surnamesJson.surnames ?? surnamesJson,
    cbdbWikidata,
    includeTier2Review: !process.argv.includes('--no-tier2-review'),
  });

  writeNdjson(out, result.accepted);
  fs.mkdirSync(path.dirname(reviewOut), { recursive: true });
  fs.writeFileSync(reviewOut, reviewRowsToCsv(result.review));
  console.log(
    `Norbert concordance: ${result.stats.accepted} accepted, ${result.stats.review} review → ${out}`,
  );
  console.log(`  by match: ${JSON.stringify(result.stats.byMatch)}`);
  console.log(`  review CSV → ${reviewOut}`);
}
