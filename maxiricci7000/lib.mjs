/**
 * MaxiRicci7000 — high-quality French office-title glosses via GPT-4o.
 *
 * Batch A: Hucker OCR entries (zh + English title + full definition), with
 * Robert des Rotours (RR) French seeds mined from Hucker's own citations.
 * Batch B: database offices absent from Hucker, retrieved against Batch A
 * French + a mined French morpheme lexicon.
 *
 * Policy: shipped French is source-tagged MaxiRicci7000 (AI output). English
 * input provenance is retained for audit; see compileTranslations.mjs.
 */
import fs from 'node:fs';

const CJK_ONLY_RE = /^[一-鿿]+$/;
const HUCKER_CITATION_RE = /\(\s*Hucker\s*\)/i;
const PLACEHOLDER_EN_RE =
  /^\[?\s*(not yet translated|untranslated|n\/?a|none|null|todo)\s*\]?$/i;
const RR_RE = /\bRR\s*:\s*([^.;\n]+)/i;

const FR_STOPWORDS = new Set(
  'de du des le la les un une et ou à au aux en y d l sur pour par avec sans dans'.split(' '),
);

export function normalizeEnglish(en) {
  return String(en ?? '')
    .replace(HUCKER_CITATION_RE, '')
    .replace(/[=]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isHuckerCited(en) {
  return HUCKER_CITATION_RE.test(String(en ?? ''));
}

export function cleanEnglishGloss(en) {
  let out = normalizeEnglish(en);
  if (!out) return '';
  out = out.replace(/\s*=+\s*$/g, '').trim();
  if (out.length < 2) return '';
  if (PLACEHOLDER_EN_RE.test(out)) return '';
  if (/^(variant|abbreviation|see |from |Manchu word)/i.test(out)) return '';
  return out;
}

export function cleanFrenchGloss(s) {
  let out = String(s ?? '').trim();
  out = out.replace(/^["'«»‘’]+|["'«»‘’]+$/g, '');
  out = out.replace(
    /^(Traduction\s*fran[cç]aise\s*:|French translation\s*:|Translation\s*:|Réponse\s*:|Answer\s*:)\s*/i,
    '',
  );
  out = out.split('\n')[0].trim();
  // Drop trailing parentheticals (pinyin dumps, rank notes) but keep internal ones.
  out = out.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return out;
}

/** Fix common OCR confusions in RR snippets (I/l, V≈l'). */
export function cleanRotoursSnippet(s) {
  let out = String(s ?? '').trim();
  out = out.replace(/\s+/g, ' ');
  // "I'abstinence" → "l'abstinence"
  out = out.replace(/\bI'/g, "l'");
  // "Vabstinence" / "V enquetes" style OCR where V stood in for l'
  out = out.replace(/\bV([aeiouàâäéèêë])/gi, "l'$1");
  out = out.replace(/^["'«»]+|["'«»]+$/g, '');
  return out.trim();
}

/**
 * Extract Robert des Rotours French citations from a Hucker full definition.
 * Hucker marks these as "RR: …".
 */
export function extractRotoursFromFull(full) {
  const text = String(full ?? '');
  const hits = [];
  const re = new RegExp(RR_RE.source, 'gi');
  let m;
  while ((m = re.exec(text)) !== null) {
    const fr = cleanRotoursSnippet(m[1]);
    if (fr && fr.length >= 2) hits.push(fr);
  }
  return hits;
}

export function batchAKey(zh, dynasty, en) {
  return `${String(zh ?? '').normalize('NFKC').trim()}\t${String(dynasty ?? '').trim()}\t${normalizeEnglish(en)}`;
}

export function batchBKey(zh, en) {
  return `${String(zh ?? '').normalize('NFKC').trim()}\t${normalizeEnglish(en)}`;
}

export function frenchContentWords(fr) {
  const words = (fr ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/['’]/g, ' ')
    .match(/[a-z]+/g) ?? [];
  return words.filter((w) => w.length > 1 && !FR_STOPWORDS.has(w));
}

/** Mine zh n-gram → French gloss lexicon (same method as English Huckbot lexicon). */
export function mineFrenchLexicon(pairs, { minSupport = 5, minP = 0.3, minLift = 8, maxGram = 4 } = {}) {
  const total = pairs.length;
  const wordDf = new Map();
  for (const { fr } of pairs) {
    for (const w of new Set(frenchContentWords(fr))) wordDf.set(w, (wordDf.get(w) ?? 0) + 1);
  }
  const gramDocs = new Map();
  for (const { zh, fr } of pairs) {
    for (let n = 1; n <= maxGram; n += 1) {
      for (let i = 0; i + n <= zh.length; i += 1) {
        const g = zh.slice(i, i + n);
        if (!gramDocs.has(g)) gramDocs.set(g, []);
        gramDocs.get(g).push(fr);
      }
    }
  }
  const lexicon = new Map();
  for (const [zh, docs] of gramDocs) {
    const support = docs.length;
    if (support < minSupport) continue;
    const wc = new Map();
    for (const fr of docs) {
      for (const w of new Set(frenchContentWords(fr))) wc.set(w, (wc.get(w) ?? 0) + 1);
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

/** Character-overlap retrieval over French Batch A pairs `{ zh, en, fr, dynasty }`. */
export function buildFrenchRetrievalIndex(pairs) {
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

export function readNdjsonLines(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const buf = fs.readFileSync(filePath);
  const rows = [];
  let start = 0;
  while (start <= buf.length) {
    let end = buf.indexOf(0x0a, start);
    if (end === -1) end = buf.length;
    if (end > start) {
      const line = buf.toString('utf8', start, end).trim();
      if (line) {
        try {
          rows.push(JSON.parse(line));
        } catch {
          // skip
        }
      }
    }
    start = end + 1;
  }
  return rows;
}

export const SYSTEM_BATCH_A = (
  'Tu es un sinologue francophone expert des institutions chinoises prémodernes. '
  + 'On te donne une entrée de dictionnaire de titres officiels : le chinois, '
  + 'la glose anglaise courte, et la définition anglaise complète (parfois avec '
  + 'une citation « RR: » = Robert des Rotours). '
  + 'Produis UNIQUEMENT une glose française savante concise — le titre de fonction '
  + 'tel qu\'on le citerait dans une édition critique francophone (registre Des Rotours / '
  + 'Hucker). Pas d\'explication, pas de caractères chinois, pas de guillemets, '
  + 'pas de rang ni de note entre parenthèses.'
);

export const SYSTEM_BATCH_B = (
  'Tu es un sinologue francophone expert des institutions chinoises prémodernes. '
  + 'On te donne un titre chinois absent du dictionnaire de Hucker, avec une glose '
  + 'anglaise, un petit lexique de morphèmes français miné sur Hucker→fr, et des '
  + 'exemples français proches. '
  + 'Produis UNIQUEMENT une glose française savante concise dans le même registre. '
  + 'Pas d\'explication, pas de caractères chinois, pas de guillemets.'
);

export function renderBatchAPrompt(target, { rotoursSeeds = [] } = {}) {
  const lines = [
    `Titre chinois : ${target.zh}`,
  ];
  if (target.dynasty) lines.push(`Dynastie : ${target.dynasty}`);
  lines.push(`Glose anglaise (titre) : ${target.en}`);
  if (target.full) {
    const full = String(target.full).slice(0, 1200);
    lines.push(`Définition anglaise complète : ${full}`);
  }
  if (target.rotours?.length) {
    lines.push(`Citation RR déjà présente dans l'entrée : ${target.rotours.join(' ; ')}`);
  }
  if (rotoursSeeds.length) {
    lines.push('Exemples de registre français (RR / Des Rotours) :');
    for (const seed of rotoursSeeds.slice(0, 8)) {
      lines.push(`  ${seed.zh} = ${seed.fr}${seed.en ? `  [en: ${seed.en}]` : ''}`);
    }
  }
  lines.push('Traduction française (titre concis) :');
  return lines.join('\n');
}

export function renderBatchBPrompt(target, retrieval, lexicon, { rotoursSeeds = [] } = {}) {
  const lines = [
    `Titre chinois : ${target.zh}`,
  ];
  if (target.dynasty) lines.push(`Dynastie : ${target.dynasty}`);
  lines.push(`Glose anglaise : ${target.en}`);

  const lx = retrieval.lexiconFor(target.zh, lexicon);
  if (lx.length) {
    lines.push('Lexique de morphèmes (zh → gloses FR, confiance) :');
    for (const [g, glosses] of lx) {
      lines.push(`  ${g} -> ${glosses.map((e) => `${e.gloss} (${e.p})`).join(', ')}`);
    }
  }
  const exemplars = retrieval.retrieve(target.zh);
  if (exemplars.length) {
    lines.push('Titres français proches (Batch A) :');
    for (const ex of exemplars) {
      lines.push(`  ${ex.zh} [${ex.dynasty || '?'}] EN:${ex.en} → FR:${ex.fr}`);
    }
  }
  if (rotoursSeeds.length) {
    lines.push('Registre RR :');
    for (const seed of rotoursSeeds.slice(0, 5)) {
      lines.push(`  ${seed.zh} = ${seed.fr}`);
    }
  }
  lines.push('Traduction française :');
  return lines.join('\n');
}

const API_URL = 'https://api.openai.com/v1/chat/completions';

export async function callOpenAi({
  model,
  system,
  prompt,
  apiKey = process.env.OPENAI_API_KEY,
  temperature = 0.2,
  maxTokens = 60,
  timeoutMs = 60000,
  retries = 4,
}) {
  if (!apiKey) throw new Error('set OPENAI_API_KEY in your shell first');
  const body = JSON.stringify({
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ],
    temperature,
    max_tokens: maxTokens,
  });
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        const text = await res.text();
        if (res.status === 429 || res.status >= 500) {
          await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
          continue;
        }
        throw new Error(`OpenAI HTTP ${res.status}: ${text.slice(0, 300)}`);
      }
      const json = await res.json();
      return (json.choices?.[0]?.message?.content ?? '').trim();
    } catch (err) {
      clearTimeout(timer);
      if (attempt === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  return '';
}

export function mulberry32(a) {
  return function rand() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(items, rand) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export { CJK_ONLY_RE };
