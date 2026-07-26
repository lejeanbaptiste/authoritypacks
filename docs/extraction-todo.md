# Authority extraction TODO

Working checklist for source extraction, re-extraction, pack compilation, and publication. The full Norbert SQL remains private; only the reduced authority export is intended for public/CI use.

## Immediate build and concordance work

- [x] Produce the reduced Norbert SQL export.
- [x] Retain Norbert `date_*` tables in the reduced export.
- [x] Exclude Norbert biographies, `person_date_filter`, death, height, residence, `test_*`, `knowledge_*`, and unrelated `biblio_*` tables.
- [x] Compile Norbert, CBDB, and DILA person/place packs locally.
- [x] Build the strict Norbert concordance: primary name + style name + dynasty.
- [x] Integrate bidirectional Norbert crosswalks into compiled authority records.
- [x] Add Norbert compilation/concordance to the global bundle build.
- [x] Add the public reduced Norbert export and checksum to the build inputs.
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
