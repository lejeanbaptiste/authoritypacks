# Authority extraction changelog

## Unreleased

### Person dates

- Pack compile now treats year `0` as unknown (CBDB sentinel): it is never emitted as birth, death, floruit, or index year. Floruit `0/0` falls through to nationality-only dating instead of inventing a zero lifespan. Import-side helpers re-check year `0` so older packs that still store it do not mint fake vitals. Takes effect on the next asset-pack rebuild.
- Norbert person compile now emits `dateSource`, routed through `shared/personDates.mjs` like the CBDB, DILA, and Wikidata compilers. Norbert's `person` table has no year columns, so every row resolves to `dateSource: 'nationality'` with no start/end — its documented contract, but previously the field was absent on all 16,050 rows. Consumers decide what may become birth/death by reading `dateSource`, so its absence made each of those guards fail open and let a dynasty span reach a person's vitals: 劉景素 (`person-3841`), who has no dates of his own, acquired birth 420 / death 479 from 劉宋, and showed as "360–539" on the disambiguation panel once the ±60 filter window was applied. The spans themselves are unchanged and still carried on `dynasties[]`/`nationality[]`, where they remain useful as date-filter anchors — they are simply now labelled as such rather than mistakable for a lifespan. CBDB and DILA were never affected: both already label every row, and neither ships dynasty spans on persons. Takes effect on the next asset-pack rebuild, which also repairs installs running an older desktop build, since the guards keyed on this label have always been present.

### Date-chunked tag packs

- Added a reusable compiler for date-partitioned authority candidates.
- Large candidate packs are now eligible for two-century NDJSON chunks, with
  a manifest describing their ranges and an `undated` companion file.
- Records crossing a real date boundary are emitted into every overlapping
  chunk; the runtime can therefore deduplicate rather than lose them.
- Zero-sentinel, implausible, and over-400-year date intervals are preserved
  in the undated file instead of inflating every historical chunk.
- Added compiler checks for preserved input entities and matchable search
  strings, plus a regression test for boundary and undated behaviour.
- Added the threshold-based chunking pass to the release-bundle builder.
- Regenerated CBDB persons with the format. The source and emitted input total
  is 658,737 entities; the manifest records distinct and physical row totals
  separately because legitimate boundary overlap increases physical rows.

The LEAF/LJB desktop reader remains compatible with legacy one-file packs and
only uses chunk selection when a pack manifest advertises this layout.
