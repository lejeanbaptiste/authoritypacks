# CHGIS compile

Compiles [CHGIS v6](https://dataverse.harvard.edu/dataverse/chgis_v6) shapefiles → LJB `AuthorityCandidate` NDJSON.

**License:** academic use only — **no redistribution** of compiled packs. Users download from Harvard Dataverse and compile locally (LJB Settings → Authorities → CHGIS).

## What to download

Place both layers in one folder before compiling:

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
# 1. Extract intermediate TSV (gitignored under reports/)
npm run extract:chgis-places -- --input ~/Downloads/chgis_layers/
npm run extract:dila-places

# 2. Build crosswalk
npm run crosswalk:chgis-dila
# → reports/chgis-dila-crosswalk.tsv
# → reports/chgis-dila-ambiguous.tsv (manual review)

# 3. Compile packs with crosswalk stamped
npm run compile:chgis -- \
  --input ~/Downloads/chgis_layers/ \
  --crosswalk reports/chgis-dila-crosswalk.tsv \
  --out packs/chgis

npm run compile:dila -- --crosswalk reports/chgis-dila-crosswalk.tsv
```

## Run locally (compile only)

```bash
npm run compile:chgis -- --input ~/Downloads/chgis_layers/ --out packs/chgis

# With CBDB crosswalk (if sqlite is available):
npm run compile:chgis -- \
  --input ~/Downloads/chgis_layers/ \
  --cbdb-sqlite ../leaf-writer/databases/cbdb_20260627.sqlite3 \
  --out packs/chgis
```

## Output

```
packs/chgis/
  manifest.json    # license: CHGIS-Academic, redistribution: local-compile-only
  places.ndjson
```

## LJB install (desktop)

**Settings → Authorities → CHGIS (historical places)** → accept license → **Install from download…** → pick the `.zip` or unzipped folder containing **both** county and prefecture layers. LJB extracts (if needed), compiles beside your entity database, and enables the pack in the auto-tag dialog.

## Attribution (show in UI)

> CHGIS, Version 6. (c) Fairbank Center for Chinese Studies of Harvard University and the Center for Historical Geographical Studies at Fudan University, 2016.
