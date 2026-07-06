/**
 * CHGIS v6 GIS layer attribute fields (ESRI shapefile DBF, UTF-8).
 * @see https://chgis.fas.harvard.edu/pages/database/
 */

/** @typedef {Record<string, unknown>} ChgisRow */

/**
 * Traditional Chinese name (NAME_FT) — primary tag surface.
 * @param {ChgisRow} row
 * @returns {string}
 */
export function chgisTraditionalName(row) {
  const value = row.NAME_FT;
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Simplified Chinese name (NAME_CH) — metadata only, not a search string.
 * @param {ChgisRow} row
 * @returns {string}
 */
export function chgisSimplifiedName(row) {
  const value = row.NAME_CH ?? row.NAM_CHN ?? row.NAME_CHN;
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Tag name: NAME_FT when present, else simplified fallback.
 * @param {ChgisRow} row
 * @returns {string}
 */
export function chgisChineseName(row) {
  return chgisTraditionalName(row) || chgisSimplifiedName(row);
}

/**
 * @param {ChgisRow} row
 * @returns {string | undefined}
 */
export function chgisAdminType(row) {
  const value = row.TYPE_CH ?? row.TYPE;
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/**
 * @param {ChgisRow} row
 * @returns {number | undefined}
 */
export function chgisYear(row, field) {
  const value = row[field];
  if (value == null || value === '') return undefined;
  const n = typeof value === 'number' ? value : parseInt(String(value), 10);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * @param {ChgisRow} row
 * @returns {string | undefined}
 */
export function chgisSystemId(row) {
  const value = row.SYS_ID ?? row.PT_ID ?? row.sys_id;
  if (value == null || value === '') return undefined;
  return String(value).trim();
}

/**
 * @param {ChgisRow} row
 * @returns {boolean}
 */
export function isPointRow(row) {
  const objType = row.OBJ_TYPE ?? row.obj_type;
  if (typeof objType === 'string' && objType.trim()) {
    return objType.trim().toUpperCase() === 'POINT';
  }
  return true;
}

/**
 * Tong ming without zhuan ming (e.g. 新興郡 → 新興 when TYPE_CH is 郡).
 * Full name must be longer than 2 code points and end with TYPE_CH; stem ≥ 2.
 * @param {string} name
 * @param {string | undefined} typeCh
 */
export function chgisStemName(name, typeCh) {
  if (!name || !typeCh || [...name].length <= 2 || !name.endsWith(typeCh)) return undefined;
  const stem = name.slice(0, -typeCh.length).trim();
  return [...stem].length >= 2 ? stem : undefined;
}

/**
 * @param {import('shapefile').Geometry | null | undefined} geometry
 * @returns {{ lat?: number, lon?: number }}
 */
export function pointLatLon(geometry) {
  if (!geometry || geometry.type !== 'Point' || !Array.isArray(geometry.coordinates)) {
    return {};
  }
  const [lon, lat] = geometry.coordinates;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return {};
  return { lat, lon };
}
