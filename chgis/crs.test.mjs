import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidWgs84, layerNeedsReprojection, reprojectToWgs84 } from './crs.mjs';

test('layerNeedsReprojection — county layer flagged, prefecture layer not', () => {
  assert.equal(layerNeedsReprojection('v6_time_cnty_pts_utf'), true);
  assert.equal(layerNeedsReprojection('v6_time_pref_pts_utf_wgs84'), false);
  assert.equal(layerNeedsReprojection('some_other_layer'), false);
});

test('reprojectToWgs84 — passes through unknown/WGS84 layers unchanged', () => {
  const coords = [111.08, 39.02];
  assert.deepEqual(reprojectToWgs84('v6_time_pref_pts_utf_wgs84', coords), coords);
});

test('reprojectToWgs84 — county layer sample lands in China bounds', () => {
  // Raw sample from the CHGIS coordinate audit (see placename-geo-disambiguation-planning.md):
  // a county point mislabeled as {lat: 4319886.6, lon: 19506884.1} before this fix.
  // Geometry coords are read as [x, y] i.e. [easting, northing].
  const [lon, lat] = reprojectToWgs84('v6_time_cnty_pts_utf', [19506884.1, 4319886.6]);
  assert.ok(isValidWgs84(lat, lon), `expected valid WGS84, got lat=${lat} lon=${lon}`);
  assert.ok(lon > 73 && lon < 135, `expected China longitude range, got ${lon}`);
  assert.ok(lat > 18 && lat < 53, `expected China latitude range, got ${lat}`);
});

test('isValidWgs84 — rejects raw projected values', () => {
  assert.equal(isValidWgs84(4319886.6, 19506884.1), false);
});

test('isValidWgs84 — accepts plausible China coordinates', () => {
  assert.equal(isValidWgs84(39.02, 111.08), true);
});
