import { resolveDynastyByLabel } from '../shared/dynastyMap.mjs';

/** CBDB pre-Han office-type nodes that are periods, not the coarse 漢前 bucket. */
export const CBDB_OFFICE_PERIOD_TYPE_LABELS = new Set(['西周', '春秋', '戰國']);

/** Approximate spans when CBDB only gives the coarse 漢前 dynasty code. */
const OFFICE_PERIOD_YEAR_RANGES = {
  西周: { startYear: -1046, endYear: -771 },
  春秋: { startYear: -770, endYear: -476 },
  戰國: { startYear: -475, endYear: -221 },
};

const PRE_HAN_DYNASTY_LABELS = new Set(['漢前', 'Pre-Han']);

const CROSS_REFERENCE_NOTE_RE = /^(?:參見|参见)/u;
const SYNONYM_NOTE_RE = /^同[\s　]/u;

/**
 * Pull a polity/dynasty label out of CBDB office notes when one is explicit.
 * @param {string | null | undefined} note
 * @returns {string | undefined}
 */
export function dynastyFromOfficeNote(note) {
  if (!note) return undefined;
  const trimmed = note.trim();
  if (!trimmed) return undefined;

  if (/(?:晋国|晉國)/u.test(trimmed)) return '晋';
  if (/^(?:掌)?(?:晋国|晉國)/u.test(trimmed)) return '晋';
  if (/^晋侯/u.test(trimmed) || /^晉侯/u.test(trimmed)) return '晋';
  if (/东西周|東西周/u.test(trimmed)) return '周';
  if (/西周/u.test(trimmed)) return '西周';

  return undefined;
}

/**
 * CBDB notes that point at other office strings are not definitional glosses.
 * @param {string | null | undefined} note
 */
export function isOfficeCrossReferenceNote(note) {
  if (!note) return false;
  const trimmed = note.trim();
  return CROSS_REFERENCE_NOTE_RE.test(trimmed) || SYNONYM_NOTE_RE.test(trimmed);
}

/**
 * Short definitional gloss from CBDB `c_notes`, with dynasty-bearing prefixes removed
 * when a dynasty was extracted separately.
 * @param {string | null | undefined} note
 * @param {string | undefined} extractedDynasty
 * @returns {string | undefined}
 */
export function officeNoteGloss(note, extractedDynasty) {
  if (!note || isOfficeCrossReferenceNote(note)) return undefined;
  let gloss = note.trim();
  if (!gloss) return undefined;

  if (extractedDynasty === '晋') {
    gloss = gloss
      .replace(/^晋侯/u, '')
      .replace(/^晉侯/u, '')
      .replace(/晋国|晉國/gu, '')
      .trim();
  }

  if (!gloss) return undefined;
  return gloss.length > 80 ? `${gloss.slice(0, 77)}…` : gloss;
}

/**
 * @param {Object} input
 * @param {string | null | undefined} input.baseDynasty
 * @param {number | null | undefined} input.baseStartYear
 * @param {number | null | undefined} input.baseEndYear
 * @param {string | null | undefined} input.note
 * @param {string[]} [input.officeTypeLabels]
 * @param {ReturnType<import('../shared/dynastyMap.mjs').loadCbdbDynastyMap>} [input.dynastyMap]
 */
export function resolveCbdbOfficePresentation(input) {
  const baseDynasty = input.baseDynasty?.trim() || undefined;
  const noteDynasty = dynastyFromOfficeNote(input.note);
  const periodTypeLabel = (input.officeTypeLabels ?? []).find((label) =>
    CBDB_OFFICE_PERIOD_TYPE_LABELS.has(label),
  );

  let dynasty = baseDynasty;
  let startYear = input.baseStartYear ?? undefined;
  let endYear = input.baseEndYear ?? undefined;

  if (baseDynasty && PRE_HAN_DYNASTY_LABELS.has(baseDynasty)) {
    if (noteDynasty) {
      dynasty = noteDynasty;
    } else if (periodTypeLabel) {
      dynasty = periodTypeLabel;
      const span = OFFICE_PERIOD_YEAR_RANGES[periodTypeLabel];
      if (span) {
        startYear = span.startYear;
        endYear = span.endYear;
      }
    }
  }

  if (input.dynastyMap && dynasty) {
    const resolved = resolveDynastyByLabel(dynasty, input.dynastyMap);
    if (resolved) {
      dynasty = resolved.label;
      if (noteDynasty || periodTypeLabel) {
        startYear = resolved.startYear;
        endYear = resolved.endYear;
      }
    }
  }

  const gloss = officeNoteGloss(input.note, noteDynasty);
  return { dynasty, startYear, endYear, gloss };
}
