/**
 * CBDB admin-type → suffix-character lookup, from the concordance built against
 * CHGIS/Wikidata (see leaf-writer/docs/placename-geo-disambiguation-planning.md
 * "Admin-vocabulary unification — scope").
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONCORDANCE_PATH = path.resolve(__dirname, '../admin_type_concordance.tsv');

/** @type {Map<string, string> | null} */
let cache = null;

/**
 * @param {string} [tsvPath]
 * @returns {Map<string, string>} lowercased cbdb_admin_type → suffix_char
 */
export function loadAdminSuffixMap(tsvPath = CONCORDANCE_PATH) {
  if (cache && tsvPath === CONCORDANCE_PATH) return cache;

  /** @type {Map<string, string>} */
  const map = new Map();
  if (!fs.existsSync(tsvPath)) return map;

  const lines = fs.readFileSync(tsvPath, 'utf8').split('\n').filter(Boolean);
  const header = lines[0].split('\t');
  const adminTypeIdx = header.indexOf('cbdb_admin_type');
  const suffixIdx = header.indexOf('suffix_char');
  if (adminTypeIdx === -1 || suffixIdx === -1) return map;

  for (const line of lines.slice(1)) {
    const cols = line.split('\t');
    const adminType = cols[adminTypeIdx]?.trim();
    const suffix = cols[suffixIdx]?.trim();
    if (adminType && suffix) map.set(adminType.toLowerCase(), suffix);
  }

  if (tsvPath === CONCORDANCE_PATH) cache = map;
  return map;
}

/**
 * @param {string | null | undefined} adminType CBDB c_admin_type raw value.
 * @param {Map<string, string>} [suffixMap]
 * @returns {string | undefined}
 */
export function suffixForAdminType(adminType, suffixMap = loadAdminSuffixMap()) {
  if (!adminType) return undefined;
  return suffixMap.get(adminType.trim().toLowerCase());
}

/**
 * Given a bare place name and its CBDB admin type, return the admin-suffixed
 * variant (e.g. 竟陵 + Xian → 竟陵縣), or undefined if no suffix is known or the
 * name already carries it.
 * @param {string} name
 * @param {string | null | undefined} adminType
 * @param {Map<string, string>} [suffixMap]
 * @returns {string | undefined}
 */
export function suffixedNameVariant(name, adminType, suffixMap = loadAdminSuffixMap()) {
  const suffix = suffixForAdminType(adminType, suffixMap);
  if (!suffix || !name || name.endsWith(suffix)) return undefined;
  return `${name}${suffix}`;
}
