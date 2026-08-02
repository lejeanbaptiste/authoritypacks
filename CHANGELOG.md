# Authority extraction changelog

## Unreleased

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
