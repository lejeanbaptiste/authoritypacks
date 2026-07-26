/**
 * CHGIS v6 shapefile layers ship in mixed CRSes despite folder/README naming implying
 * WGS84 for both. Confirmed by reading each layer's .prj sidecar directly:
 *
 * - v6_time_pref_pts_utf_wgs84 → GCS_WGS_1984 (already WGS84 degrees, no transform needed)
 * - v6_time_cnty_pts_utf       → Xian_1980_Gauss_Kruger_zone_19 (projected, meter-scale
 *   easting/northing — was previously passed through raw and mislabeled as lat/lon)
 *
 * See leaf-writer/docs/placename-geo-disambiguation-planning.md "CHGIS coordinate audit"
 * for the investigation that found this.
 */
import proj4 from 'proj4';

/**
 * proj4 definition strings keyed by shapefile layer basename (no extension).
 * A layer not listed here is assumed already WGS84 and passed through unchanged.
 *
 * Xian 1980 datum shift is approximated as zero (no official towgs84 params published
 * for Xian 1980 → WGS84); adequate for ~5 km clustering thresholds, not survey-grade.
 */
const LAYER_CRS = {
  v6_time_cnty_pts_utf: '+proj=tmerc +lat_0=0 +lon_0=111 +k=1 +x_0=19500000 +y_0=0 +ellps=IAG75 +towgs84=0,0,0 +units=m +no_defs',
};

const WGS84 = 'EPSG:4326';

/**
 * @param {string} layer Shapefile basename (no extension), e.g. "v6_time_cnty_pts_utf".
 * @returns {boolean}
 */
export function layerNeedsReprojection(layer) {
  return Object.prototype.hasOwnProperty.call(LAYER_CRS, layer);
}

/**
 * Reproject a raw [x, y] pair from a known-projected layer's CRS into WGS84 [lon, lat].
 * Returns the input unchanged if the layer isn't a known projected CRS.
 * @param {string} layer
 * @param {[number, number]} coords [x, y] as read from the shapefile geometry.
 * @returns {[number, number]} [lon, lat] in WGS84 degrees.
 */
export function reprojectToWgs84(layer, coords) {
  const def = LAYER_CRS[layer];
  if (!def) return coords;
  return proj4(def, WGS84, coords);
}

/**
 * @param {number} lat
 * @param {number} lon
 * @returns {boolean}
 */
export function isValidWgs84(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}
