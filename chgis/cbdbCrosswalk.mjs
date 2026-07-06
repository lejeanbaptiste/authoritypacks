import fs from 'node:fs';
import Database from 'better-sqlite3';

/**
 * Build CHGIS SYS_ID / pt_id → CBDB c_addr_id map from ADDR_CODES.CHGIS_PT_ID.
 * @param {string | null | undefined} sqlitePath
 * @returns {Map<string, string>}
 */
export function loadCbdbChgisCrosswalk(sqlitePath) {
  /** @type {Map<string, string>} */
  const map = new Map();
  if (!sqlitePath || !fs.existsSync(sqlitePath)) return map;

  const db = new Database(sqlitePath, { readonly: true });
  try {
    const rows = db
      .prepare(
        `SELECT c_addr_id, CHGIS_PT_ID
         FROM ADDR_CODES
         WHERE CHGIS_PT_ID IS NOT NULL AND TRIM(CAST(CHGIS_PT_ID AS TEXT)) != ''`,
      )
      .all();
    for (const row of rows) {
      const chgisId = String(row.CHGIS_PT_ID).trim();
      const cbdbId = String(row.c_addr_id).trim();
      if (chgisId && cbdbId) map.set(chgisId, cbdbId);
    }
  } finally {
    db.close();
  }
  return map;
}
