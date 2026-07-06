/**
 * One-line disambiguation clues (see leaf-writer authority-databases-planning.md §4).
 */

/**
 * @param {Object} p
 * @param {string} p.name
 * @param {string} [p.pinyin]
 * @param {number} [p.birthYear]
 * @param {number} [p.deathYear]
 * @param {number} [p.indexYear]
 * @param {number} [p.flStart]
 * @param {number} [p.flEnd]
 * @param {string} [p.dynastyChn]
 * @param {string} [p.dynastyEn]
 * @param {string} [p.extra]
 */
export function cbdbPersonClue(p) {
  const tail = [];
  const dates = formatLifeDates(p);
  if (dates) tail.push(dates);
  const dyn = formatDynasty(p.dynastyChn, p.dynastyEn);
  if (dyn) tail.push(dyn);
  if (p.extra) tail.push(p.extra);

  if (p.pinyin && tail.length) return `${p.name} (${p.pinyin}, ${tail.join(', ')})`;
  if (p.pinyin) return `${p.name} (${p.pinyin})`;
  if (tail.length) return `${p.name} (${tail.join(', ')})`;
  return p.name;
}

/** Simpler format: 名 (dates, dynasty — extra) */
function formatLifeDates(p) {
  if (p.birthYear != null && p.deathYear != null) return `${p.birthYear}–${p.deathYear}`;
  if (p.birthYear != null) return `b. ${p.birthYear}`;
  if (p.deathYear != null) return `d. ${p.deathYear}`;
  if (p.flStart != null && p.flEnd != null) return `fl. ${p.flStart}–${p.flEnd}`;
  if (p.indexYear != null) return `fl. ${p.indexYear}`;
  return '';
}

function formatDynasty(chn, en) {
  if (!chn && !en) return '';
  if (chn && en) return `${chn} ${en}`;
  return chn || en || '';
}

/**
 * @param {Object} p
 * @param {string} p.name
 * @param {number} [p.birthYear]
 * @param {number} [p.deathYear]
 * @param {string} [p.dynasty]
 * @param {string} [p.conciseFirstClause]
 * @param {string} [p.occupation]
 */
export function dilaPersonClue(p) {
  const inner = [];
  const dates = formatLifeDates(p);
  if (dates) inner.push(dates);
  if (p.dynasty) inner.push(p.dynasty);
  if (p.occupation) inner.push(p.occupation);
  else if (p.conciseFirstClause) inner.push(p.conciseFirstClause);

  if (inner.length === 0) return p.name;
  return `${p.name} (${inner.join(', ')})`;
}

/**
 * @param {Object} p
 * @param {string} p.name
 * @param {string} [p.subtype]
 * @param {string} [p.district]
 * @param {number} [p.startYear]
 * @param {number} [p.endYear]
 * @param {string} [p.dynastyChn]
 */
export function cbdbPlaceClue(p) {
  const parts = [p.name];
  const meta = [];
  if (p.subtype) meta.push(p.subtype);
  if (p.dynastyChn) meta.push(p.dynastyChn);
  if (p.startYear != null && p.endYear != null) meta.push(`${p.startYear}–${p.endYear}`);
  if (meta.length) parts.push(`(${meta.join(', ')})`);
  return parts.join(' ');
}

/**
 * @param {Object} p
 * @param {string} p.name
 * @param {string} [p.category]
 * @param {string} [p.district]
 */
export function dilaPlaceClue(p) {
  const meta = [];
  if (p.category) meta.push(p.category);
  if (p.district) meta.push(p.district);
  if (!meta.length) return p.name;
  return `${p.name} (${meta.join(' — ')})`;
}

/**
 * @param {Object} p
 * @param {string} p.name
 * @param {string} [p.subtype]
 * @param {number} [p.startYear]
 * @param {number} [p.endYear]
 * @param {string} [p.presentLoc]
 * @param {string} [p.pinyin]
 */
export function chgisPlaceClue(p) {
  const meta = [];
  if (p.subtype) meta.push(p.subtype);
  if (p.startYear != null && p.endYear != null) meta.push(`${p.startYear}–${p.endYear}`);
  else if (p.startYear != null) meta.push(`from ${p.startYear}`);
  else if (p.endYear != null) meta.push(`to ${p.endYear}`);
  if (p.presentLoc) meta.push(p.presentLoc);
  if (p.pinyin && !meta.length) meta.push(p.pinyin);
  if (!meta.length) return p.name;
  return `${p.name} (${meta.join(', ')})`;
}

/**
 * @param {Object} p
 * @param {string} p.name
 * @param {string} [p.translation]
 * @param {string} [p.dynastyChn]
 */
export function cbdbOfficeClue(p) {
  const parts = [p.name];
  if (p.translation) parts.push(`(${p.translation}`);
  if (p.dynastyChn) parts.push(`${p.dynastyChn})`);
  else if (p.translation) parts.push(')');
  return parts.join(', ').replace(', (', ' (').replace('(,', '(');
}

/** First clause before 。 or . */
export function conciseFirstClause(text) {
  if (!text) return undefined;
  const trimmed = text.trim();
  const m = /^([^。.]+[。.])/.exec(trimmed);
  const clause = (m ? m[1] : trimmed.slice(0, 40)).replace(/[。.]$/, '');
  return clause.length > 60 ? `${clause.slice(0, 57)}…` : clause;
}

/** Parse DILA ISO date text → year */
export function yearFromTeiDate(text) {
  if (!text) return undefined;
  const m = /([+\-]?\d{3,4})/.exec(text);
  if (!m) return undefined;
  const y = parseInt(m[1], 10);
  return Number.isFinite(y) ? y : undefined;
}
