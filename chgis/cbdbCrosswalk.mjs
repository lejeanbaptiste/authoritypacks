import fs from 'node:fs';

/**
 * Build CHGIS SYS_ID / pt_id → CBDB c_addr_id map from ADDR_CODES.CHGIS_PT_ID.
 *
 * better-sqlite3 is a native module and is not part of the toolchain bundle
 * shipped with packaged Grognard installs (see scripts/build-chgis-toolchain-release.mjs) —
 * it's only present in full dev checkouts of this repo. When it's missing,
 * the crosswalk is skipped rather than failing the whole CHGIS compile.
 * @param {string | null | undefined} sqlitePath
 * @returns {Promise<Map<string, string>>}
 */
export async function loadCbdbChgisCrosswalk(sqlitePath) {
  /** @type {Map<string, string>} */
  const map = new Map();
  if (!sqlitePath || !fs.existsSync(sqlitePath)) return map;

  let Database;
  try {
    ({ default: Database } = await import('better-sqlite3'));
  } catch {
    console.warn('[chgis] better-sqlite3 not available; skipping CBDB crosswalk.');
    return map;
  }

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
