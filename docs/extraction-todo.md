# Authority extraction TODO

Working checklist for source extraction, re-extraction, pack compilation, and publication. The full Norbert SQL remains private; only the reduced authority export is intended for public/CI use.

## Current decision: offices and appointments (2026-07-26)

The office and appointment authority-pack work is implemented for tagging and
disambiguation. The remaining work is to refresh production inputs and publish
the resulting artifacts.

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

## Refresh checklist

Use these lists in order when an upstream source changes. “Rescrape” means
re-fetch or re-export the source; CBDB and Norbert are database inputs rather
than web scrapes.

### Rescrape or re-fetch

- [ ] Re-fetch the pinned CBDB SQLite release and record its version, URL, and
  checksum.
- [ ] Re-export Norbert's reduced SQL dump, including `person_offices`, and
  record its source version and checksum.
- [ ] Refresh DILA person/place exports together if the global bundle is being
  refreshed.
- [ ] Refresh raw Wikidata extracts only when the person concordance or
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
- [ ] Rebuild the combined pack bundle, including the combined
  `appointments.ndjson`: `npm run build:packs`.

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
- [ ] Commit/review the public reduced Norbert export and generated build changes.
- [ ] Run the release build in CI and inspect the resulting Chinese bundle.

## Wikidata re-extraction and recompilation

- [ ] Determine whether the full raw Wikidata person extracts still exist.
- [ ] If raw extracts exist, recompile all retained person packs with `compiledCrosswalkFromRaw` enabled; no dump rescan is needed.
- [ ] If raw extracts do not exist, rescan the Wikidata dump for the required person slices.
- [ ] Verify compiled Wikidata `metadata.crosswalk` preserves CBDB (`P497`), DILA (`P1187`), VIAF, NDL, BDRC, and CHGIS identifiers.
- [ ] Re-run identifier and pack tests and spot-check records with known CBDB/DILA IDs.
- [ ] Rebuild the Norbert concordance against corrected Wikidata packs.

## Wikidata Chinese toponyms

- [ ] Finish the current Chinese toponym extraction/query work.
- [ ] Define Chinese place inclusion and dynasty/period policy.
- [ ] Extract raw Chinese place records with stable Q IDs and external IDs.
- [ ] Compile the Chinese Wikidata place pack.
- [ ] Validate against CBDB, DILA, and CHGIS names and coordinates.
- [ ] Produce an ambiguity report for duplicate names and conflicting historical periods.
- [ ] Decide whether it is a supplement only or part of the default Chinese place lifecycle.
- [ ] Add the accepted pack to the global bundle and CI staging.

## Wikidata Japanese toponyms

- [ ] Finish the current Japanese toponym extraction/query work.
- [ ] Define Japanese label, alias, reading, and historical-period policy.
- [ ] Extract raw Japanese place records with stable Q IDs and NDL/other identifiers.
- [ ] Compile the Japanese Wikidata place pack.
- [ ] Validate against NDL places and the Japanese corpus.
- [ ] Produce an ambiguity report for variant readings, duplicate names, and modern/historical collisions.
- [ ] Decide whether it supplements NDL places or is a separate opt-in source.
- [ ] Add the accepted pack to the global bundle and CI staging.

## Source refreshes and final validation

- [ ] Pin and document the CBDB release used for the next build.
- [ ] Refresh DILA person/place exports together and record checksums.
- [ ] Refresh Norbert’s reduced export whenever the private dump changes; update checksum/version.
- [ ] Rebuild affected packs, manifests, bundle indexes, and release tarballs.
- [ ] Run `npm test` and a full local `npm run build:packs`.
- [ ] Inspect concordance counts and sample links from Norbert, CBDB, DILA, and Wikidata.
- [ ] Upload a CI artifact and test loading in LJB before publishing a release.
