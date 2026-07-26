# CHGIS coordinate smoke test

Run this after recompiling CHGIS (`npm run compile:chgis -- --input ~/Downloads/chgis_layers/ --out packs/chgis`) on a machine that has the real `.shp`/`.prj` files, to confirm the county-layer CRS reprojection (`chgis/crs.mjs`) actually worked against real data — it was only verified against a synthetic sample value in `chgis/crs.test.mjs`, never the real shapefile.

## 1. Check the compile log for dropped points

`parseShapefile.mjs` logs a warning per layer if any points come out of valid WGS84 bounds after reprojection and drops them rather than shipping bad coordinates:

```
[chgis] v6_time_cnty_pts_utf: dropped N point(s) with out-of-WGS84-bounds coordinates after reprojection — check the layer's CRS in crs.mjs.
```

- **No warning at all** → good sign, but not sufficient on its own (a wrong-but-plausible reprojection can still land in-bounds).
- **Warning with N > 0** → the proj4 string in `crs.mjs` doesn't match the real layer's CRS. Compare `LAYER_CRS.v6_time_cnty_pts_utf` in `chgis/crs.mjs` against the actual `.prj` sidecar (`~/Downloads/chgis_layers/v6_time_cnty_pts_utf/v6_time_cnty_pts_utf.prj`, plain-text WKT) and fix the proj4 definition to match.

## 2. Bounds check across the whole county layer

```bash
node -e "
const fs = require('fs');
const lines = fs.readFileSync('packs/chgis/places.ndjson', 'utf8').trim().split('\n');
let county = 0, valid = 0, bad = [];
for (const line of lines) {
  const r = JSON.parse(line);
  if (r.metadata?.layer !== 'v6_time_cnty_pts_utf') continue;
  county++;
  const g = r.metadata?.geo;
  if (!g) continue;
  const ok = g.lat >= 18 && g.lat <= 53 && g.lon >= 73 && g.lon <= 135;
  if (ok) valid++; else bad.push({ id: r.authorityId, name: r.primaryName, geo: g });
}
console.log('county records:', county, 'with valid China-bounds geo:', valid);
if (bad.length) console.log('out-of-China-bounds samples:', bad.slice(0, 5));
"
```

Expect `valid` to be close to `county` (some records legitimately have no geo, and a handful of true border/frontier places may fall slightly outside a strict China bounding box — that's fine; wildly wrong values are not).

## 3. Spot-check specific places against `PRES_LOC`

Pick 3-5 well-known county-layer places and confirm their reprojected coordinates roughly match their `PRES_LOC` (present-day location) description:

```bash
node -e "
const fs = require('fs');
const lines = fs.readFileSync('packs/chgis/places.ndjson', 'utf8').trim().split('\n');
for (const line of lines) {
  const r = JSON.parse(line);
  if (r.metadata?.layer !== 'v6_time_cnty_pts_utf') continue;
  if (!r.primaryName?.includes('保德')) continue; // swap in a name you recognize
  console.log(r.primaryName, r.metadata.geo, r.metadata.description);
}
"
```

E.g. 保德縣 (Baode county, Shanxi) should land around lat ~39, lon ~111 — check the printed `description` (which includes `PRES_LOC`) names a real place consistent with those coordinates on a map.

## 4. Cross-check against the prefecture layer (already-correct baseline)

The prefecture layer (`v6_time_pref_pts_utf_wgs84`) never needed reprojection and was already confirmed clean in the original audit. If a county point and a prefecture point that should be geographically close (e.g. a county and its parent prefecture) come out far apart after reprojection, that's a strong signal the county CRS fix is still wrong, not that the two places are genuinely distant.

## If it's still wrong

- Re-read the real `.prj` file's WKT verbatim and compare every parameter (`central_meridian`, `false_easting`, `scale_factor`, datum/ellipsoid) against `LAYER_CRS.v6_time_cnty_pts_utf` in `chgis/crs.mjs`.
- Double check axis order — shapefile geometry is `[x, y]` (`[easting, northing]` for a projected CRS); `parseShapefile.mjs` passes `[lon, lat]` into `reprojectToWgs84`, which expects `[x, y]` in the *source* CRS on the way in and returns `[lon, lat]` in WGS84 on the way out. A swapped axis order is a common source of exactly this kind of bug (see how the original mislabeling happened).
- See `leaf-writer/docs/placename-geo-disambiguation-planning.md` § "CHGIS coordinate audit" and § "Phase 0a" for the full investigation history and the exact proj4 string used.
