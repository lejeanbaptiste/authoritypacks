# Authority extraction changelog

## Unreleased

### CBDB offices

- **Pre-Han office clues** (`cbdb/officeMetadata.mjs`): `metadata.dynasty` and year spans now prefer a polity named in `c_notes` (e.g. 晋) or the office-type period (西周 / 春秋 / 戰國) over the coarse CBDB `漢前` bucket. Definitional `c_notes` glosses (e.g. 掌外事) appear in the one-line `description`; `參見 …` and `同 …` cross-reference notes are omitted. Tang/Song and later offices are unchanged.
- **Pre-Han office dedup** (`cbdb/officeDedup.mjs`): near-duplicate 漢前 rows with the same name, note, translation, and office-type ids collapse to the lowest `c_office_id`. **61 groups / 103 merged ids** in the current CBDB dump; `offices.ndjson` drops from 33 764 to **33 661** rows. Merged ids ship in new **`office-concordance.ndjson`** beside the CBDB pack (`compile.mjs`, `compileRecords.mjs`). Later-dynasty homonyms are never collapsed.
- `shared/dynastyMap.mjs` adds 西周 / 春秋 / 戰國 / 晋 spans; `shared/clue.mjs` accepts an office gloss in `cbdbOfficeClue`.

### Norbert person concordance

- Reviewed link in `reports/norbert-person-concordance-review.csv`: **Norbert person-487 → CBDB 135476** (王肅, 西晉, 子雍). Rebuilt into `packs/norbert/norbert-concordance.ndjson` via `concordance:merge-review` + `concordance:integrate`. **person-2296** is unchanged (CBDB 468114 + DILA A003283); the two 王肅 rows are not merged.

### Huckbot5000 licensing

- The `huckbot5000` translations manifest now states its redistribution status instead of
  contradicting it. The reviewed gap-fill pack (`packs/huckbot5000/translations.ndjson`) has
  shipped in `authority-packs-chinese` since v0.1.14, but its manifest still read
  `license: 'internal-pending-review'` with "before any public redistribution". It now emits
  `license: 'internal'` + `policy.redistribute: true` with a dated owner-decision note
  (`compileTranslations.mjs`, `buildToolVersion` 0.1.0 → 0.1.1). Scope is that pack only: the
  `huckbot5000-insiders` collision archive stays local-only and the lexicon manifest keeps
  `internal-pending-review`. README Guarantees and `huckbot5000-planning.md`'s Legal note
  updated to match. No change to translated rows.

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
