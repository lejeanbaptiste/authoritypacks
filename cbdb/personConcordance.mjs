/** Load CBDB's internal person merge/concordance table. */

/** @typedef {{ canonicalId: string, mergedFromId: string, notes?: string, source?: string, pages?: string }} PersonConcordanceRow */

/**
 * @param {import('better-sqlite3').Database} db
 * @returns {{ rows: PersonConcordanceRow[], canonicalByPerson: Map<string, string> }}
 */
export function loadCbdbPersonConcordance(db) {
  if (!tableExists(db, 'MERGED_PERSON_DATA')) {
    return { rows: [], canonicalByPerson: new Map() };
  }
  const rows = db.prepare(`
    SELECT c_personid, c_merged_from_personid, c_notes, c_source, c_pages
    FROM MERGED_PERSON_DATA
    ORDER BY c_personid, c_merged_from_personid
  `).all().map((row) => ({
    canonicalId: String(row.c_personid),
    mergedFromId: String(row.c_merged_from_personid),
    notes: row.c_notes || undefined,
    source: row.c_source != null ? String(row.c_source) : undefined,
    pages: row.c_pages || undefined,
  }));

  const parent = new Map();
  for (const row of rows) {
    parent.set(row.mergedFromId, row.canonicalId);
    if (!parent.has(row.canonicalId)) parent.set(row.canonicalId, row.canonicalId);
  }
  const canonicalByPerson = new Map();
  for (const id of parent.keys()) {
    const seen = new Set();
    let current = id;
    while (parent.has(current) && parent.get(current) !== current && !seen.has(current)) {
      seen.add(current);
      current = parent.get(current);
    }
    canonicalByPerson.set(id, current);
  }
  return { rows, canonicalByPerson };
}

function tableExists(db, name) {
  return Boolean(db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name));
}

