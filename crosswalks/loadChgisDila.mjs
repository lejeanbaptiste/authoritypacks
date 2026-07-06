import fs from 'node:fs';
import { readTsv } from './buildChgisDila.mjs';

/**
 * Load chgis-dila-crosswalk.tsv into lookup maps.
 * @param {string | null | undefined} filePath
 * @returns {{ chgisToDila: Map<string, string>, dilaToChgis: Map<string, string> }}
 */
export function loadChgisDilaCrosswalk(filePath) {
  const chgisToDila = new Map();
  const dilaToChgis = new Map();
  if (!filePath || !fs.existsSync(filePath)) {
    return { chgisToDila, dilaToChgis };
  }

  for (const row of readTsv(filePath)) {
    const chgisId = row.chgis_sys_id?.trim();
    const dilaId = row.dila_pl_id?.trim();
    if (!chgisId || !dilaId) continue;
    chgisToDila.set(chgisId, dilaId);
    dilaToChgis.set(dilaId, chgisId);
  }

  return { chgisToDila, dilaToChgis };
}
