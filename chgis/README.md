# CHGIS compile

Compiles [CHGIS v6](https://dataverse.harvard.edu/dataverse/chgis_v6) shapefiles → LJB `AuthorityCandidate` NDJSON.

**License:** academic use only (CHGIS-Academic). Portions of the CHGIS data are folded into LJB's multi-source `chinese` authority pack alongside CBDB/DILA/Wikidata, with mandatory attribution — see `upstream/pins.json`'s `chgis.redistributionNote` for the reasoning. CHGIS is compiled once locally by a maintainer (see below) and the result is checked into this repo via Git LFS; CI ships it pre-compiled like every other source, and end users no longer compile it themselves.

## Required source assets

Only these two point layers are required for the LJB historical-place pack. Download both from Harvard Dataverse and place them in one folder before compiling:

| Dataset | DOI | File |
|---------|-----|------|
| County points (WGS84) | [10.7910/DVN/Q9VOF5](https://doi.org/10.7910/DVN/Q9VOF5) | `v6_time_cnty_pts_utf_wgs84` |
| Prefecture points (WGS84) | [10.7910/DVN/WW1PD6](https://doi.org/10.7910/DVN/WW1PD6) | `v6_time_pref_pts_utf_wgs84` |

## v1 compile policy

- **Input:** one or more `.shp` point layers in a directory (polygon rows skipped via `OBJ_TYPE`)
- **Tag name:** `NAME_FT` (traditional Chinese); `NAME_CH` stored as metadata only
- **Search strings:** full `NAME_FT` plus stem without `TYPE_CH` when name length > 2 and name ends with the admin suffix (新興郡 → 新興郡 + 新興)
- **IDs:** `SYS_ID` (matches CBDB `CHGIS_PT_ID` / `pt_id`)
- **Dates:** `BEG_YR` / `END_YR` on each historical instance row
- **Geo:** point geometry lat/lon (WGS84) for crosswalk building
- **Crosswalk:** optional `--cbdb-sqlite` stamps `metadata.crosswalk.cbdb`; optional `--crosswalk` TSV stamps `metadata.crosswalk.dila`
- **Min length:** 2 code points (shared normalizer)

## CHGIS↔DILA crosswalk

DILA does not ship a CHGIS index. Build one locally from name + geo (~0.5° tolerance):

```bash
# 1. Extract intermediate TSV (gitignored under reports/, except the crosswalk itself)
npm run extract:chgis-places -- --input ~/Downloads/chgis_layers/
npm run extract:dila-places

# 2. Build crosswalk
npm run crosswalk:chgis-dila
# → reports/chgis-dila-crosswalk.tsv   (checked in — shipped with the release so
#                                        build-pack-bundle.mjs can stamp DILA's
#                                        crosswalkChgisCount without recompiling CHGIS)
# → reports/chgis-dila-ambiguous.tsv (manual review, not checked in)

# 3. Compile the pack with both crosswalks stamped
npm run compile:chgis -- \
  --input ~/Downloads/chgis_layers/ \
  --crosswalk reports/chgis-dila-crosswalk.tsv \
  --cbdb-sqlite ../leaf-writer/databases/cbdb_20260627.sqlite3 \
  --out packs/chgis
```

## Maintainer release flow

CHGIS v6 is static, so this only needs re-running on a rare version bump — not on every release:

1. Run the crosswalk + compile steps above, producing `packs/chgis/places.ndjson` + `packs/chgis/manifest.json` and `reports/chgis-dila-crosswalk.tsv`.
2. Commit them (Git LFS tracks `packs/chgis/*.ndjson`; see `.gitattributes`).
3. `scripts/build-pack-bundle.mjs` stages the checked-in pack into the release bundle automatically (no shapefile parsing happens in CI) and feeds the checked-in crosswalk TSV into DILA's own compile step so DILA's `crosswalkChgisCount` stays correct.

## Output

```
packs/chgis/
  manifest.json    # license: CHGIS-Academic; redistribution/attribution patched from pins.json at release time
  places.ndjson
```

## Attribution (show in UI)

> CHGIS, Version 6. (c) Fairbank Center for Chinese Studies of Harvard University and the Center for Historical Geographical Studies at Fudan University, 2016.

This citation is surfaced in the LJB desktop app via the generic manifest-driven attributions disclosure under the `chinese` authority profile — there is no CHGIS-specific settings UI.
