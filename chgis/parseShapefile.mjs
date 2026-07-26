import path from 'node:path';
import * as shapefile from 'shapefile';
import { pointLatLon } from './fieldMap.mjs';
import { isValidWgs84, layerNeedsReprojection, reprojectToWgs84 } from './crs.mjs';

/** @typedef {import('./fieldMap.mjs').ChgisRow} ChgisRow */

/**
 * @param {string} shpPath
 * @returns {AsyncGenerator<ChgisRow>}
 */
export async function* iterateShapefileRows(shpPath) {
  const layer = path.basename(shpPath, '.shp');
  const needsReprojection = layerNeedsReprojection(layer);
  const source = await shapefile.open(shpPath, undefined, { encoding: 'utf-8' });
  let droppedOutOfBounds = 0;
  while (true) {
    const result = await source.read();
    if (result.done) break;
    if (!result.value?.properties) continue;
    let { lat, lon } = pointLatLon(result.value.geometry);
    if (lat != null && lon != null && needsReprojection) {
      [lon, lat] = reprojectToWgs84(layer, [lon, lat]);
    }
    /** @type {ChgisRow} */
    const row = { ...result.value.properties };
    if (lat != null && lon != null) {
      if (isValidWgs84(lat, lon)) {
        row.lat = lat;
        row.lon = lon;
      } else {
        droppedOutOfBounds += 1;
      }
    }
    yield row;
  }
  if (droppedOutOfBounds > 0) {
    console.warn(
      `[chgis] ${layer}: dropped ${droppedOutOfBounds} point(s) with out-of-WGS84-bounds coordinates after reprojection — check the layer's CRS in crs.mjs.`,
    );
  }
}
