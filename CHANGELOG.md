# Authority extraction changelog

## Unreleased

### Person dates

- Pack compile now treats year `0` as unknown (CBDB sentinel): it is never emitted as birth, death, floruit, or index year. Floruit `0/0` falls through to nationality-only dating instead of inventing a zero lifespan. Import-side helpers re-check year `0` so older packs that still store it do not mint fake vitals. Takes effect on the next asset-pack rebuild.

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
