/**
 * Shared helpers for the Huckbot5000 generation/collision pipeline:
 * loading the local Hucker OCR corpus, tokenizing English glosses, mining a
 * retrieval index for exemplar-based prompting, and detecting collisions
 * between a generated candidate and Hucker's actual text.
 *
 * The corpus loaded here (skunkworks/scripts/out/hucker_entries.ndjson) is
 * local-only and never shipped -- see docs/huckbot5000-planning.md. Every
 * consumer of this module (generate.mjs for retrieval, audit.mjs for
 * collision detection) reads it for comparison purposes only.
 *
 * A second Hucker-text source is also read here: CBDB's own OFFICE_CODES
 * table tags ~2,381 of its `c_office_trans` values with a literal "(Hucker)"
 * citation -- verified to be Hucker's own text lifted near-verbatim (see
 * docs/huckbot5000-planning.md's CBDB finding). Only 22% of those headwords
 * exist in the OCR corpus above (the rest are longer compound institutional
 * titles CBDB records that Hucker's own dictionary doesn't headword
 * separately), so the OCR corpus alone leaves a real collision blind spot.
 * `readCbdbHuckerPairs` closes it using the full CBDB sqlite directly
 * (cleaner data than OCR, and covers the compound titles the OCR corpus
 * misses).
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const CJK_ONLY_RE = /^[一-鿿]+$/;
const REJECT_RE =
  /^(variant|abbreviation|abbreviated|unofficial|lit\.|erroneous|see |a |an |the |from |probably|apparently|Manchu word|quasiofficial|archaic|common|generic|throughout|also)/i;
const STOPWORDS = new Set('of the and in a an to for or on with by'.split(' '));

export function contentWords(en) {
  const words = (en ?? '').toLowerCase().match(/[a-z'-]+/g) ?? [];
  return words.filter((w) => !STOPWORDS.has(w));
}

/** Read Hucker's OCR-extracted entries, filtered to real title translations. */
export function readHuckerPairs(filePath) {
  const buf = fs.readFileSync(filePath);
  const seen = new Set();
  const pairs = [];
  let start = 0;
  while (start <= buf.length) {
    let end = buf.indexOf(0x0a, start);
    if (end === -1) end = buf.length;
    if (end > start) {
      const row = JSON.parse(buf.toString('utf8', start, end));
      const zh = (row.chinese ?? '').trim();
      let en = (row.translation_title ?? '').trim();
      if (zh && en && CJK_ONLY_RE.test(zh) && !REJECT_RE.test(en)) {
        en = en.replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
        const key = `${zh} ${en}`;
        if (en && !seen.has(key)) {
          seen.add(key);
          pairs.push({ zh, en, dynasty: row.dynasty ?? null, full: (row.translation_full ?? '').trim() });
        }
      }
    }
    start = end + 1;
  }
  return pairs;
}

/**
 * Read CBDB's own Hucker-tagged office translations directly from the full
 * upstream sqlite (OFFICE_CODES.c_office_trans / c_office_trans_alt ending
 * in the "(Hucker)" citation). Returns the same {zh, en, dynasty, full}
 * shape as readHuckerPairs so both sources can be merged before indexing.
 * Requires `better-sqlite3` (already a repo dependency) and a local copy of
 * the full CBDB sqlite (e.g. `.upstream/cbdb.sqlite3`, fetched by
 * `npm run fetch:upstream` -- not the stripped reference sqlite, which has
 * these fields removed by design).
 */
export async function readCbdbHuckerPairs(sqlitePath) {
  // Dynamic import: callers without the sqlite file present (e.g. CI) don't
  // need better-sqlite3's native binding loaded to use the rest of this module.
  const { default: Database } = await import('better-sqlite3');
  const db = new Database(sqlitePath, { readonly: true });
  try {
    const rows = db
      .prepare(
        `SELECT c_office_chn AS zh, c_office_trans AS en FROM OFFICE_CODES WHERE c_office_trans LIKE '%(Hucker)%'
         UNION ALL
         SELECT c_office_chn AS zh, c_office_trans_alt AS en FROM OFFICE_CODES WHERE c_office_trans_alt LIKE '%(Hucker)%'`,
      )
      .all();
    const seen = new Set();
    const pairs = [];
    for (const row of rows) {
      const zh = (row.zh ?? '').trim();
      const en = (row.en ?? '').replace(/\(Hucker\)/gi, '').trim();
      if (!zh || !en) continue;
      const key = `${zh} ${en}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({ zh, en, dynasty: null, full: en });
    }
    return pairs;
  } finally {
    db.close();
  }
}

/** Group Hucker pairs by exact headword -- the primary collision lookup key. */
export function indexHuckerByHeadword(pairs) {
  const byZh = new Map();
  for (const p of pairs) {
    if (!byZh.has(p.zh)) byZh.set(p.zh, []);
    byZh.get(p.zh).push(p);
  }
  return byZh;
}

/** Mine a character-n-gram -> gloss lexicon (same method as huckbot5000/compile.mjs). */
export function mineLexicon(pairs, { minSupport = 5, minP = 0.3, minLift = 8, maxGram = 4 } = {}) {
  const total = pairs.length;
  const wordDf = new Map();
  for (const { en } of pairs) {
    for (const w of new Set(contentWords(en))) wordDf.set(w, (wordDf.get(w) ?? 0) + 1);
  }
  const gramDocs = new Map();
  for (const { zh, en } of pairs) {
    for (let n = 1; n <= maxGram; n += 1) {
      for (let i = 0; i + n <= zh.length; i += 1) {
        const g = zh.slice(i, i + n);
        if (!gramDocs.has(g)) gramDocs.set(g, []);
        gramDocs.get(g).push(en);
      }
    }
  }
  const lexicon = new Map();
  for (const [zh, docs] of gramDocs) {
    const support = docs.length;
    if (support < minSupport) continue;
    const wc = new Map();
    for (const en of docs) {
      for (const w of new Set(contentWords(en))) wc.set(w, (wc.get(w) ?? 0) + 1);
    }
    const glosses = [...wc.entries()]
      .map(([gloss, n]) => {
        const p = n / support;
        const base = (wordDf.get(gloss) ?? 0) / total;
        const lift = base ? p / base : 0;
        return { gloss, p: Math.round(p * 1000) / 1000, lift: Math.round(lift * 10) / 10 };
      })
      .filter((g) => g.p >= minP && g.lift >= minLift)
      .sort((a, b) => b.p - a.p)
      .slice(0, 4);
    if (glosses.length) lexicon.set(zh, glosses);
  }
  return lexicon;
}

/** Character-overlap retrieval index for exemplar prompting, per the eval harness design. */
export function buildRetrievalIndex(pairs) {
  const byChar = new Map();
  pairs.forEach((p, i) => {
    for (const c of p.zh) {
      if (!byChar.has(c)) byChar.set(c, []);
      byChar.get(c).push(i);
    }
  });
  return {
    retrieve(zh, k = 6) {
      const score = new Map();
      for (const c of new Set(zh)) {
        for (const i of byChar.get(c) ?? []) score.set(i, (score.get(i) ?? 0) + 1);
      }
      const scored = [...score.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 60)
        .map(([i, s]) => {
          const t = pairs[i];
          let bigramBonus = 0;
          for (let n = 2; n < 4; n += 1) {
            for (let j = 0; j + n <= zh.length; j += 1) {
              if (t.zh.includes(zh.slice(j, j + n))) bigramBonus += 1;
            }
          }
          return { score: s + 2 * bigramBonus, pair: t };
        });
      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, k).map((s) => s.pair);
    },
    lexiconFor(zh, lexicon) {
      const rows = [];
      const seenGrams = new Set();
      for (let n = 4; n >= 1; n -= 1) {
        for (let i = 0; i + n <= zh.length; i += 1) {
          const g = zh.slice(i, i + n);
          if (seenGrams.has(g)) continue;
          const gl = lexicon.get(g);
          if (gl) {
            rows.push([g, gl]);
            seenGrams.add(g);
          }
        }
      }
      return rows;
    },
  };
}

/**
 * Hucker's own stock hedge phrases -- mined from translation_full across the
 * corpus (see docs/huckbot5000-planning.md's contamination finding: a model
 * reproduced "Meaning and derivation not clear" verbatim for an obscure
 * entry). A short generated gloss that contains one of these is evidence the
 * model is recalling Hucker's editorial voice, not composing independently,
 * even when it doesn't match any specific headword's gold gloss.
 */
export const HEDGE_PHRASES = [
  'meaning not clear',
  'meaning and derivation not clear',
  'derivation not clear',
  'sense and derivation not clear',
  'meaning arguable',
  'meaning obscure',
  'derivation obscure',
];

function normalizeGloss(s) {
  return (s ?? '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i += 1) {
    const cur = [i];
    for (let j = 1; j <= n; j += 1) {
      cur[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j - 1], prev[j], cur[j - 1]);
    }
    prev = cur;
  }
  return prev[n];
}

function similarity(a, b) {
  const na = normalizeGloss(a);
  const nb = normalizeGloss(b);
  if (!na || !nb) return 0;
  const dist = levenshtein(na, nb);
  return 1 - dist / Math.max(na.length, nb.length);
}

/**
 * Generic institutional nouns the model often tacks onto a pinyin dump
 * ("Pingshun Office"). Stripped before comparing against romanization.
 */
const TRANSLITERATION_GENERIC = new Set([
  'office', 'bureau', 'agency', 'department', 'ministry', 'directorate',
  'service', 'court', 'board', 'commission', 'unit', 'division', 'section',
  'administration', 'administrator', 'official', 'officer', 'title', 'post',
]);

/**
 * Detect "pinyin punt" failures (平隼案 → "Pingshun Office"): the contentful
 * part of the gloss is just a romanization of the Chinese headword.
 * Returns { flag: 'none' | 'transliteration', detail }.
 *
 * @param {string} zh
 * @param {string} candidateGloss
 * @param {{ romanize?: (zh: string) => string }} [options] inject for tests
 */
export function detectTransliterationPunt(zh, candidateGloss, options = {}) {
  const gloss = String(candidateGloss ?? '').trim();
  if (!gloss || !zh) return { flag: 'none', detail: 'empty' };

  let roman;
  if (options.romanize) {
    roman = options.romanize(zh);
  } else {
    const { pinyin } = require('pinyin-pro');
    roman = pinyin(zh, { toneType: 'none', type: 'array' }).join('');
  }
  const romanNorm = String(roman ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (romanNorm.length < 4) return { flag: 'none', detail: 'romanization too short' };

  const words = contentWords(gloss);
  const content = words.filter((w) => !TRANSLITERATION_GENERIC.has(w));
  if (!content.length) {
    return {
      flag: 'transliteration',
      detail: `gloss is only generic institutional nouns over romanization of ${zh}`,
    };
  }

  const joined = content.join('').toLowerCase().replace(/[^a-z]/g, '');
  if (joined.length < 4) return { flag: 'none', detail: 'content too short' };

  if (joined === romanNorm || romanNorm.includes(joined) || joined.includes(romanNorm)) {
    return {
      flag: 'transliteration',
      detail: `gloss content "${content.join(' ')}" is a romanization of ${zh}`,
    };
  }
  const sim = similarity(joined, romanNorm);
  if (sim >= 0.85) {
    return {
      flag: 'transliteration',
      detail: `gloss content "${content.join(' ')}" is ${(sim * 100).toFixed(0)}% similar to romanization of ${zh}`,
    };
  }
  return { flag: 'none', detail: 'not a transliteration punt' };
}

/**
 * The hard collision gate (Step 4 of docs/huckbot5000-planning.md). Checks a
 * generated candidate gloss for a given headword against every Hucker entry
 * for that exact headword, plus a corpus-wide scan for stylistic tells.
 * Returns { flag: 'none' | 'exact' | 'near-verbatim' | 'stylistic', detail }.
 * `flag !== 'none'` must always route to source: 'Hucker' (local collision
 * archive only), never 'Huckbot5000', regardless of any human review decision
 * — publishable packs must not carry matching wording (contamination finding).
 */
export function detectCollision(zh, candidateGloss, huckerByHeadword) {
  const normCandidate = normalizeGloss(candidateGloss);
  const lowerCandidate = (candidateGloss ?? '').toLowerCase();

  for (const phrase of HEDGE_PHRASES) {
    if (lowerCandidate.includes(phrase)) {
      return { flag: 'stylistic', detail: `contains Hucker's stock hedge phrase "${phrase}"` };
    }
  }

  const entries = huckerByHeadword.get(zh) ?? [];
  for (const entry of entries) {
    const normGold = normalizeGloss(entry.en);
    if (!normGold) continue;
    if (normCandidate === normGold) {
      return { flag: 'exact', detail: `matches Hucker's gloss for ${zh} verbatim: "${entry.en}"` };
    }
    const sim = similarity(candidateGloss, entry.en);
    if (sim >= 0.85) {
      return {
        flag: 'near-verbatim',
        detail: `${(sim * 100).toFixed(0)}% similar to Hucker's gloss for ${zh}: "${entry.en}"`,
      };
    }
    // Full content-word overlap on a multi-word gloss is a collision even
    // when word order/function words differ (Experiment 1's polysemy risk).
    const candWords = new Set(contentWords(candidateGloss));
    const goldWords = new Set(contentWords(entry.en));
    if (goldWords.size >= 2 && candWords.size >= 2) {
      const overlap = [...goldWords].filter((w) => candWords.has(w)).length;
      if (overlap === goldWords.size && overlap === candWords.size) {
        return {
          flag: 'near-verbatim',
          detail: `identical content words to Hucker's gloss for ${zh}: "${entry.en}"`,
        };
      }
    }
    // One side's content words wholly contained in the other's is also a
    // collision, e.g. candidate "Erudite" against an OCR-noisy Hucker title
    // "Erudite van official of special" -- deliberately conservative (the
    // hard gate should over-reject, not under-reject; see doc's Step 4).
    // Guarded against single generic short words to limit false positives.
    if (candWords.size >= 1 && goldWords.size >= 1) {
      const [smaller, larger] = candWords.size <= goldWords.size ? [candWords, goldWords] : [goldWords, candWords];
      if (smaller.size >= 2 || [...smaller][0]?.length >= 4) {
        const contained = [...smaller].every((w) => larger.has(w));
        if (contained) {
          return {
            flag: 'near-verbatim',
            detail: `content words of "${candidateGloss}" are a subset of Hucker's gloss for ${zh}: "${entry.en}"`,
          };
        }
      }
    }
  }

  return { flag: 'none', detail: entries.length ? `no collision (${entries.length} Hucker entries checked)` : 'no Hucker entry for this headword' };
}
