# Authority extraction TODO

Working checklist for source extraction, re-extraction, pack compilation, and publication. The full Norbert SQL remains private; only the reduced authority export is intended for public/CI use.

**This file is the living todo list** for authority-pack work. Prefer updating
checkboxes here over scattering status notes in chat or ad-hoc scratch files.

## Open work (snapshot 2026-08-06)

High-priority unfinished items only. Detail and history live in the sections
below.

### Next (blocked on LJB merge / design)

- [ ] **Pack-purge Settings UI** — pending design so it does not fight existing
  LJB `entityOrders` / merge-docket vocabulary ([purge-orders.md](./purge-orders.md)).
  Hold LJB code edits until the other-machine commits are merged.
- [ ] **First GitHub Release** — upload local tarball + `packs-index.json`;
  smoke-test install in LJB (hold until LJB merge + purge design settle).

### Small follow-ups

- [ ] Confirm tag-bomb / pack-preview always pass `dateFilter` into
  `authorityPackRead` (desktop chunking is ready; check any callers still using
  a date-blind `cachedPackReader` wrapper). **LJB-side — wait for merge.**
- [ ] Optional place polish: zh-hant vs CBDB/DILA/CHGIS; ja vs NDL ambiguity
  reports.

### Just finished (2026-08-06)

- [x] **DILA/BDRC crosswalk dump pass** — fresh
  `wikidata:extract-crosswalk` (`viaf,cbdb,ndl,dila,bdrc`): **5,143,842** rows;
  dila **2,859** / bdrc **23,266** pairs. Re-attached to person packs
  (**329,289 / 481,983** QIDs with sidecar hits). Spot-checks: 唐代宗 `Q9753` →
  DILA `A004379` (+ CBDB/norbert); `person-bo` sample → BDRC `P1KG21914`.
- [x] **Pack bundle rebuilt** with person-row crosswalks + dila/bdrc pair
  sidecars staged:
  `dist/authority-packs-2026-07-05+cbdb20260627+norbert2026-07-25-reduced-authority+wikidatalocal+ndllocal.tar.gz`
  (~404 MB), sha256
  `d3edc3f3fc16e1052c28afa895d31ea459adcb08e569de2d2e1a4f3af57bc3b9`,
  plus `dist/packs-index.json`.

### Earlier (2026-08-04 / 08-05)

- [x] **Attach crosswalks to Wikidata person packs** (viaf/cbdb/ndl first pass)
  + Japanese places P17 + Norbert `person-N` integrate fix + date segregation.
  See git / prior bundle notes.
---

## Current decision: offices and appointments (2026-07-26)

The office and appointment authority-pack work is implemented for tagging and
disambiguation. The remaining work is to refresh production inputs and publish
the resulting artifacts.

**Validation handoff (2026-07-26):** implementation has been handed back for
local build and test verification. Keep the release and production-refresh
items below open until those results and any bug fixes have been incorporated.

- CBDB is canonical for office identity, office classification, and office
hierarchy wherever CBDB covers the office.
- Norbert remains a tagging source and an observational source for offices
outside CBDB's period coverage. Norbert office rows retain their source IDs;
the source ID is not treated as a cross-source identity.
- The CBDB office structure is the shared output shape: office records,
classification records, and parent/child office relations. Norbert's
concatenated office strings contribute inferred parent/child relations with
Norbert provenance and low confidence.
- Both sources contribute office search strings to tagging. Disambiguation
uses the shared office records and relations; it does not require Norbert
and CBDB to have identical coverage.
- Both sources contribute appointment records for person disambiguation.
Records retain source, person reference, office reference/name, appointment
type where available, and source reference. Year spans and biographical
order are intentionally omitted for now.
- Appointment metadata is attached to person authority candidates and is
carried into the authority cache when a person is imported or refreshed in
`entities.xml`. This is not yet TEI appointment/event encoding.



## Current decision: places of origin (2026-07-26)

Place-of-origin evidence is source-preserving and is grouped by `originType`:
`jiguan`, `ancestralOrigin`, `benguan`, `birthplace`, and `placeOfOrigin` are
independent assertions and are never merged with one another.

- [x] Extract origin assertions from CBDB, Norbert, and DILA.
- [x] Preserve source place strings, source-local place ids, source categories,
  place types, and coordinates when supplied.
- [x] Link people only through explicit crosswalks or the strict Norbert
  concordance; a shared label is not an identity link.
- [x] Resolve each origin type independently into `coordinate-mode`,
  `id-mode`, or `conflict-id-mode`.
- [x] Treat coordinates within the configured radius (default 5 km) as
  coordinate-mode only when place types are compatible.
- [x] Keep missing-coordinate evidence in id-mode and retain every assertion.
- [x] Keep distance or place-type conflicts in conflict-id-mode for review;
  never discard one of the conflicting source assertions.
- [x] Decide the human review/import UI for conflict-id-mode groups.
- [x] Import approved origin assertions into project `entities.xml`.

Run the audit after compiling the source packs:

```bash
npm run audit:origins -- \
  --cbdb /tmp/place-origin-cbdb-v2 \
  --norbert /tmp/place-origin-norbert-v2 \
  --dila /tmp/place-origin-dila-v2 \
  --concordance /tmp/place-origin-norbert-v2/concordance.ndjson \
  --out /tmp/origin-review.ndjson
```

The audit is read-only with respect to project entities. See the top-level
`README.md` for the mode semantics and review policy.

## Refresh checklist

Use these lists in order when an upstream source changes. “Rescrape” means
re-fetch or re-export the source; CBDB and Norbert are database inputs rather
than web scrapes.

### Rescrape or re-fetch

- [x] Re-fetch the pinned CBDB SQLite release and record its version, URL, and
  checksum.
- [x] Re-export Norbert's reduced SQL dump, including `person_offices`, and
  record its source version and checksum.
- [x] Refresh DILA person/place exports together if the global bundle is being
  refreshed.
- [x] Refresh raw Wikidata extracts only when the person concordance or
  crosswalk inputs have changed; otherwise reuse the retained raw extracts.



### Regenerate

- [ ] Recreate the CBDB fixture when tests or local development require one:
  `npm run create:cbdb-fixture`.
- [ ] Compile CBDB, including `persons.ndjson`, `places.ndjson`,
  `offices.ndjson`, `office-types.ndjson`, `office-relations.ndjson`,
  `appointments.ndjson`, and `manifest.json`:
  `npm run compile:cbdb`.
- [ ] Compile Norbert, including `persons.ndjson`, `offices.ndjson`,
  `office-relations.ndjson`, `appointments.ndjson`, and `manifest.json`:
  `npm run compile:norbert`.
- [ ] Regenerate `office-concordance.ndjson` from the compiled Norbert and
  CBDB office packs: `npm run concordance:offices`.
- [ ] Recompile any changed Wikidata person packs and rebuild the Norbert
  person concordance if their crosswalks changed.
- [x] Rebuild the combined pack bundle, including the combined
  `appointments.ndjson`: `npm run build:packs` (2026-08-05 local tarball).



### Recompile or republish downstream

- [ ] Run the authority-pack test suite and inspect appointment, office
  relation, concordance, and manifest counts: `npm test`.
- [ ] Rebuild the Norbert plugin when its tagging or relation-extraction code
  changes: `npm run build:norbert` from the plugins repository.
- [ ] Rebuild the Leaf-Writer package when authority metadata or cache handling
  changes, then run its typecheck and focused authority/disambiguation tests.
- [ ] Stage the refreshed authority-pack bundle for LJB and verify that a
  person imported into `entities.xml` carries the expected appointment clues.
- [ ] Build and test the LJB desktop release only after the staged bundle has
  passed the local smoke test.
- [ ] Publish the versioned release tarball and checksums; do not silently
  replace a pack already installed in a project.



## Immediate build and concordance work

- [x] Produce the reduced Norbert SQL export.
- [x] Retain Norbert `date_*` tables in the reduced export.
- [x] Exclude Norbert biographies, `person_date_filter`, death, height, residence, `test_*`, `knowledge_*`, and unrelated `biblio_*` tables.
- [x] Compile Norbert, CBDB, and DILA person/place packs locally.
- [x] Build the strict Norbert concordance: primary name + style name + dynasty.
- [x] Tiered Norbert person concordance (`norbert/concordance.mjs`) + review CSV.
- [x] Merge reviewed `reports/norbert-person-concordance-review.csv` (`link` rows)
  into accepted concordance and re-run `integrateConcordance`
  (`npm run concordance:merge-review` then `npm run concordance:integrate`).
- [x] Pack **purge orders** format + install ingest → local developer docket
  ([purge-orders.md](./purge-orders.md)). Settings UI for the docket still open.
- [x] Integrate bidirectional Norbert crosswalks into compiled authority records.
- [x] Add Norbert compilation/concordance to the global bundle build.
- [x] Add the public reduced Norbert export and checksum to the build inputs.
- [x] Add Norbert `person_offices` to the reduced export and compile source
  appointment records.
- [x] Compile CBDB posting data into source-preserving appointment records.
- [x] Combine CBDB and Norbert appointments in the global bundle and attach
  them to person authority candidates.
- [x] Carry appointment metadata into authority-cache entries for reused
  persons during disambiguation.
- [x] Hand implementation to local build/test validation.
- [x] Commit/review the public reduced Norbert export and generated build changes.
- [x] Run the release build in CI and inspect the resulting Chinese bundle.



## Wikidata re-extraction and recompilation

- [x] Determine whether the full raw Wikidata person extracts still exist.
- [ ] If raw extracts exist, recompile all retained person packs with `compiledCrosswalkFromRaw` enabled; no dump rescan is needed.
- [x] Otherwise (no usable person raw): **join** retained
  `packs/wikidata/wikidata-authority-crosswalk.ndjson` (and/or the VIAF
  concordance) onto compiled person packs — still **no dump crawl**.
  (`npm run wikidata:attach-crosswalk`, 2026-08-05).
- [x] If raw extracts do not exist, rescan the Wikidata dump for the required person slices.
  *(Superseded 2026-08-04: full-dump identifier sidecars already retained; do not rescan for crosswalk alone.)*
- [x] Verify compiled Wikidata `metadata.crosswalk` preserves CBDB (`P497`), VIAF,
  NDL, DILA (`P1187`), and BDRC (2026-08-06 extract + attach).
- [x] Filter + chunk VIAF concordance to shipped pack QIDs
  (`npm run wikidata:viaf-filter` → `viaf-wikidata-concordance.filtered.ndjson`
  + `viaf-wikidata-concordance/*.ndjson`). Full dump sidecar stays local.
- [x] Wire filtered VIAF concordance into disambiguation merge
  (`viafWikidataConcordance.ts` + enrich path in `disambiguationCandidates.ts`
  on LJB GitHub `main`).
- [x] Publish filtered VIAF artifacts in the local release tarball
  (`viaf-wikidata-concordance.filtered.ndjson` + chunks; GitHub Release still open).
- [x] Re-run identifier and pack tests and spot-check records with known CBDB/DILA IDs.
- [x] Rebuild the Norbert concordance against corrected Wikidata packs.



## Runtime / LJB pack consumption

- [x] Date-chunk-aware `authorityPack:read` (desktop) when manifest advertises
  `dateChunks` and the caller passes `startYear`/`endYear`.
- [ ] Confirm every tag-bomb / pack-preview caller passes `dateFilter` into
  `authorityPackRead` (tag bomb already does via `uncachedPackReader`; audit
  `cachedPackReader` wrappers).
- [ ] Purge-order **Settings UI** (pending list, accept/ignore) — blocked until
  pack-purge vs `entityOrders` design is settled ([purge-orders.md](./purge-orders.md)).
- [ ] First GitHub **Release** with tarball + `packs-index.json`; smoke-test
  install in LJB (hold until open work above settles).



## Wikidata Chinese toponyms

**Done (2026-08):** `place-zh-hant` compiled (~254k, `label-only` membership), staged in the bundle/CI scripts, and available in LJB tag bomb as `wikidata-places-zh-hant`.

**Policy:** Chinese **supplement** only — not on the Chinese lifecycle `packIds` list. Default place authorities remain CBDB + DILA + CHGIS; Wikidata places stay opt-in because the slice is large and noisy (modern + historical labels, weak period filtering).

- [x] Finish the current Chinese toponym extraction/query work.
- [x] Define Chinese place inclusion and dynasty/period policy (`label-only` zh-hant; no dynasty packs).
- [x] Extract raw Chinese place records with stable Q IDs and external IDs.
- [x] Compile the Chinese Wikidata place pack.
- [x] Decide: supplement only (not default Chinese lifecycle).
- [x] Add the accepted pack to the global bundle and CI staging.
- [ ] Optional polish: formal validate vs CBDB/DILA/CHGIS coords; ambiguity report for duplicate names / conflicting periods.



## Wikidata Japanese toponyms

**Done (2026-08-05):** `place-ja` re-extracted with Japan `P17` membership
(**214,358** raw → **214,157** compiled), staged in the global pack bundle, and
wired in LJB tag bomb as `wikidata-places-ja` (opt-in; not on Japanese
lifecycle `packIds`).

**Policy:** Japanese **supplement** only — default place authority remains NDL;
Wikidata places stay opt-in (Japan-scoped).

- [x] Finish the current Japanese toponym extraction/query work.
- [x] Define Japanese label, alias, reading, and historical-period policy (Japan `P17`; not world `label-only`).
- [x] Re-extract / recompile `place-ja` with Japan `P17` membership
  (`wikidata:extract-places-ja` / `wikidata:compile-places-ja`).
- [x] Decide: supplement to NDL places (opt-in in tag bomb, not default lifecycle).
- [x] Add the accepted pack to the global bundle and CI staging.
- [x] Wire `wikidata-places-ja` into LJB (`packPaths`, tag bomb load order, Japanese auto-tag UI).
- [ ] Optional polish: validate vs NDL places / Japanese corpus; ambiguity report for readings and modern/historical collisions.



## Per-release refresh checklist (recurring)

Not unfinished feature work — run these when cutting a new authority-pack release
(see [`ci-packs.md`](ci-packs.md)). Skip sources that did not change.

1. **Pin upstream** — bump CBDB / DILA / NDL pins in `upstream/pins.json`; record versions and checksums.
2. **Refresh exports** — re-fetch DILA person/place together; refresh Norbert’s reduced export only when the private dump changed.
3. **Rebuild** — `npm test` and `npm run build:packs` (or `build:packs:full`); regenerate manifests, indexes, and tarballs.
4. **Spot-check** — concordance counts and a few sample links across Norbert, CBDB, DILA, Wikidata.
5. **Publish** — upload CI/release artifacts; smoke-test install + pack load in LJB before announcing.