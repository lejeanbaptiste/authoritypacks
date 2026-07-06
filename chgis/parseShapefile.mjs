import * as shapefile from 'shapefile';
import { pointLatLon } from './fieldMap.mjs';

/** @typedef {import('./fieldMap.mjs').ChgisRow} ChgisRow */

/**
 * @param {string} shpPath
 * @returns {AsyncGenerator<ChgisRow>}
 */
export async function* iterateShapefileRows(shpPath) {
  const source = await shapefile.open(shpPath, undefined, { encoding: 'utf-8' });
  while (true) {
    const result = await source.read();
    if (result.done) break;
    if (!result.value?.properties) continue;
    const { lat, lon } = pointLatLon(result.value.geometry);
    /** @type {ChgisRow} */
    const row = { ...result.value.properties };
    if (lat != null && lon != null) {
      row.lat = lat;
      row.lon = lon;
    }
    yield row;
  }
}
