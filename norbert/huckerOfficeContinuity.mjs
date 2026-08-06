/**
 * Hucker-based office continuity check for Norbert↔CBDB concordance.
 *
 * Policy (undated Norbert offices only):
 * - If Hucker treats the title as one office over a span that includes the
 *   CBDB dynasty and at least one earlier dynasty → same office → link.
 * - If Hucker gives distinct glosses for different periods → different → no link.
 * - If Hucker is silent (no entry, or only attests the CBDB dynasty alone) →
 *   different → no link.
 *
 * Dated Norbert offices do not use this gate; period overlap is enough.
 */
const CJK_ONLY = /^[\u4e00-\u9fff]+$/;

/** Chronological atoms used when expanding Hucker range tags like SUI-SUNG. */
export const HUCKER_DYNASTY_ORDER = [
  'CHOU',
  "CH'IN",
  'HAN',
  'N-S DIV',
  'SUI',
  "T'ANG",
  'SUNG',
  'LIAO',
  'CHIN',
  'YUAN',
  'MING',
  "CH'ING",
];

const ORDER_INDEX = new Map(HUCKER_DYNASTY_ORDER.map((d, i) => [d, i]));

/**
 * Map CBDB / Norbert Chinese dynasty labels onto Hucker dynasty atoms.
 * @param {string | null | undefined} label
 * @returns {string | null}
 */
export function cbdbDynastyToHuckerAtom(label) {
  const s = String(label ?? '').trim();
  if (!s) return null;
  if (/清/.test(s)) return "CH'ING";
  if (/明/.test(s)) return 'MING';
  if (/元/.test(s)) return 'YUAN';
  if (/金/.test(s)) return 'CHIN';
  if (/遼/.test(s)) return 'LIAO';
  if (/宋/.test(s)) return 'SUNG';
  if (/唐/.test(s)) return "T'ANG";
  if (/隋/.test(s)) return 'SUI';
  if (/漢|秦漢/.test(s)) return 'HAN';
  if (/秦/.test(s)) return "CH'IN";
  if (/周/.test(s) && !/北周|北朝/.test(s)) return 'CHOU';
  // 晉 and the Northern/Southern courts → N-S DIV (not Jurchen 金 / CHIN)
  if (/晉|魏|齊|梁|陳|北周|北齊|北魏|南朝|六朝|三國|蜀|吳|五胡/.test(s)) return 'N-S DIV';
  return null;
}

/**
 * Normalize one Hucker dynasty token to an order atom when possible.
 * @param {string} token
 * @returns {string | null}
 */
function normalizeHuckerToken(token) {
  let t = token
    .toUpperCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return null;
  // Parenthetical era notes: N-S DIV (N. WEI) → N-S DIV
  t = t.replace(/\s*\(.*?\)\s*/g, '').trim();
  if (t.includes('N-S DIV') || t.includes('NS DIV') || t === 'N-S' || t === 'NS') return 'N-S DIV';
  if (t === "CH'IN" || t === 'CHIN-CHIN' || t === 'CH IN') return "CH'IN";
  // Jurchen Jin is CHIN in Hucker; Western/Eastern Jin are usually N-S DIV (Chin)
  if (t === 'CHIN') return 'CHIN';
  if (t === "T'ANG" || t === 'TANG') return "T'ANG";
  if (t === "CH'ING" || t === 'CHING') return "CH'ING";
  if (ORDER_INDEX.has(t)) return t;
  return null;
}

/**
 * Expand a Hucker dynasty field into the set of dynasty atoms it covers.
 * Handles ranges (SUI-SUNG), lists (T'ANG, CHIN), and mixed forms.
 * @param {string | null | undefined} dynastyField
 * @returns {Set<string>}
 */
export function expandHuckerDynastyField(dynastyField) {
  const out = new Set();
  const raw = String(dynastyField ?? '').trim();
  if (!raw) return out;

  // Split on commas first (distinct spans listed together).
  for (const part of raw.split(/,/)) {
    const piece = part.trim();
    if (!piece) continue;
    if (piece.includes('-')) {
      const [leftRaw, rightRaw] = piece.split(/-/).map((s) => s.trim());
      const left = normalizeHuckerToken(leftRaw);
      const right = normalizeHuckerToken(rightRaw);
      if (left && right && ORDER_INDEX.has(left) && ORDER_INDEX.has(right)) {
        const a = ORDER_INDEX.get(left);
        const b = ORDER_INDEX.get(right);
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        for (let i = lo; i <= hi; i += 1) out.add(HUCKER_DYNASTY_ORDER[i]);
        continue;
      }
    }
    const atom = normalizeHuckerToken(piece);
    if (atom) out.add(atom);
  }
  return out;
}

function normalizeGloss(en) {
  return String(en ?? '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {Array<{ zh: string, en: string, dynasty?: string | null }>} huckerPairs
 * @returns {Map<string, Array<{ en: string, dynasty: string | null }>>}
 */
export function indexHuckerOfficeEntries(huckerPairs) {
  const byZh = new Map();
  for (const p of huckerPairs) {
    const zh = String(p.zh ?? '').normalize('NFKC').trim();
    if (!zh || !CJK_ONLY.test(zh)) continue;
    if (!byZh.has(zh)) byZh.set(zh, []);
    byZh.get(zh).push({ en: p.en, dynasty: p.dynasty ?? null });
  }
  return byZh;
}

/**
 * Does Hucker affirm this headword is one continuous office across a span
 * that includes `cbdbDynastyLabel` and at least one earlier dynasty?
 *
 * @param {string} zh
 * @param {string | null | undefined} cbdbDynastyLabel
 * @param {Map<string, Array<{ en: string, dynasty: string | null }>>} huckerByZh
 * @returns {{ ok: boolean, reason: string }}
 */
export function huckerAffirmsContinuity(zh, cbdbDynastyLabel, huckerByZh) {
  const entries = huckerByZh.get(String(zh ?? '').normalize('NFKC').trim()) ?? [];
  if (!entries.length) return { ok: false, reason: 'hucker-silent' };

  const glosses = [...new Set(entries.map((e) => normalizeGloss(e.en)).filter(Boolean))];
  if (glosses.length > 1) return { ok: false, reason: 'hucker-distinct-glosses' };

  const cbdbAtom = cbdbDynastyToHuckerAtom(cbdbDynastyLabel);
  if (!cbdbAtom) return { ok: false, reason: 'cbdb-dynasty-unmapped' };

  const covered = new Set();
  for (const entry of entries) {
    for (const atom of expandHuckerDynastyField(entry.dynasty)) covered.add(atom);
  }
  if (!covered.has(cbdbAtom)) return { ok: false, reason: 'hucker-omits-cbdb-dynasty' };
  if (covered.size < 2) return { ok: false, reason: 'hucker-single-dynasty-only' };

  const cbdbIdx = ORDER_INDEX.get(cbdbAtom);
  const hasEarlier = [...covered].some((atom) => (ORDER_INDEX.get(atom) ?? 99) < cbdbIdx);
  if (!hasEarlier) return { ok: false, reason: 'hucker-no-earlier-dynasty' };

  return { ok: true, reason: 'hucker-continuous-span' };
}

/**
 * Does Hucker already define this headword for the target dynasty?
 * Used to skip Huckbot5000 generation (LLM or procedural) — we do not ship
 * Hucker's gloss; we simply avoid spending API / inventing a competing one
 * when his period coverage already exists.
 *
 * @param {string} zh
 * @param {string | null | undefined} dynastyLabel CBDB/Norbert Chinese dynasty
 * @param {Map<string, Array<{ en: string, dynasty: string | null }>>} huckerByZh
 * @returns {{ covered: boolean, reason: string, huckerDynasty?: string | null }}
 */
export function huckerCoversPeriod(zh, dynastyLabel, huckerByZh) {
  const entries = huckerByZh.get(String(zh ?? '').normalize('NFKC').trim()) ?? [];
  if (!entries.length) return { covered: false, reason: 'no-entry' };

  const atom = cbdbDynastyToHuckerAtom(dynastyLabel);
  if (!atom) return { covered: false, reason: 'dynasty-unmapped' };

  for (const entry of entries) {
    const span = expandHuckerDynastyField(entry.dynasty);
    if (span.has(atom)) {
      return { covered: true, reason: 'period-covered', huckerDynasty: entry.dynasty };
    }
  }
  return { covered: false, reason: 'period-not-in-hucker' };
}

