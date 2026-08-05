# Authority extraction

Offline **build pipelines** that turn public authority sources (CBDB, DILA, Wikidata, NDL, CHGIS, …) into **tag-string packs** for [LEAF/LJB](https://gitlab.com/calincs/cwrc/leaf-writer/leaf-writer) auto-tagging. **GeoNames packs are out of scope** (no Track G work).

This repo holds **extract → compile → publish** tooling. The **matcher, review UI, and tag bomb** live in leaf-writer.

## Start here

| Doc | What it covers |
|-----|----------------|
| [**docs/extraction-todo.md**](docs/extraction-todo.md) | **Living todo list** — open work snapshot + full checklists |
| [**docs/phases.md**](docs/phases.md) | Master roadmap — all sources, human checkpoints |
| [**wikidata/README.md**](wikidata/README.md) | Wikidata config tables + validator (W0 done) |
| [**docs/person-concordance-plan.md**](docs/person-concordance-plan.md) | Tiered Norbert↔CBDB/DILA/Wikidata person linking (implemented + review merge) |
| [**docs/purge-orders.md**](docs/purge-orders.md) | Developer pack change notices → user review docket |
| [**CHANGELOG.md**](CHANGELOG.md) | Shipped compiler and pack-format changes |

Leaf-writer companions (integration, not extraction):

- [authority-packs-planning.md](../leaf-writer/docs/authority-packs-planning.md) — strategy
- [authority-databases-phases.md](../leaf-writer/docs/authority-databases-phases.md) — CBDB/DILA in-app (tracks **A**, **L**)

## Layout

```
authority extraction/
  docs/phases.md          # roadmap + progress dashboard
  docs/extraction-todo.md # living TODO checklist (start here for “what’s left”)
  shared/                 # normalize, clue, ndjson, teiParse, dynastyMap
  cbdb/                   # compile + report (C1–C2 done)
  dila/                   # compile (D1 done)
  wikidata/               # Wikidata track (W0 done)
  packs/                  # compiled NDJSON (gitignored)
  reports/                # ambiguity CSVs
```

## VIAF ↔ Wikidata concordance (status)

LJB disambiguation merges live Wikidata + VIAF hits using a precompiled P214
table (pack id `wikidata-viaf-concordance`). Runtime wiring is **done** on LJB
GitHub `main` (`viafWikidataConcordance.ts`).

**Locally built (not yet in a public release tarball):**

- `packs/wikidata/viaf-wikidata-concordance.filtered.ndjson` (~11 MB)
- `packs/wikidata/viaf-wikidata-concordance/` prefix chunks + `manifest.json`

**Still open** (see [docs/extraction-todo.md](docs/extraction-todo.md)):

1. Optional: expand the crosswalk extract with DILA/BDRC keys (dump pass) if
   those person-row ids are needed; viaf/cbdb/ndl are already on person packs.
2. Sanity-check: a string that returns both Wikidata and VIAF via LINCS for a
   known pair should collapse to one candidate.

**Done locally:** person-row attach (`npm run wikidata:attach-crosswalk`) and
filtered VIAF concordance in the rebuild tarball.

Rebuild / refresh commands:

```bash
npm run wikidata:attach-crosswalk   # join sidecar ids onto person packs
npm run wikidata:viaf-concordance   # full table from pack crosswalks
npm run wikidata:viaf-filter        # filter + chunk to shipped QIDs
```

See also `wikidata/README.md` § Authority concordance.

## Quick start

```bash
npm test
npm run compile:cbdb
npm run compile:dila
node cbdb/report.mjs
```

To audit person-origin evidence after compiling source packs:

```bash
npm run audit:origins -- \
  --cbdb /tmp/place-origin-cbdb-v2 \
  --norbert /tmp/place-origin-norbert-v2 \
  --dila /tmp/place-origin-dila-v2 \
  --concordance /tmp/place-origin-norbert-v2/concordance.ndjson \
  --out /tmp/origin-review.ndjson
```

The audit links people only through explicit crosswalks or the strict Norbert
concordance, then classifies each origin type independently as
`coordinate-mode`, `id-mode`, or `conflict-id-mode`. It does not create or
modify project entities. `coordinate-mode` is the only mode eligible for
automatic coordinate import. `id-mode` retains the source place string and
authority id when coordinates are unavailable. `conflict-id-mode` retains all
source assertions as place ids and requires review; the report records whether
the conflict is due to `distance` or incompatible `place-type` values.

Origin assertions are never merged across `jiguan`, `ancestralOrigin`,
`benguan`, `birthplace`, and `placeOfOrigin`. Within one origin type, every
source assertion remains evidence. A person crosswalk groups evidence for
review, but does not make unlike place strings equivalent. This keeps a
conflicting jiguan set reviewable without discarding either source record.

**CI pack bundle** (same output GitLab produces):

```bash
npm run build:packs:full    # download pinned upstream + compile + dist/*.tar.gz
```

See [docs/ci-packs.md](docs/ci-packs.md).

Norbert’s reduced SQL export is compiled here into the backend `norbert/`
authority pack. The Wikipedia-reviewed noble-title asset (`wiki-nt-links.ndjson`)
is separate: it lives in the Norbert plugin repo and is bundled with the plugin
as a runtime aid for tagging/disambiguation, not as part of the public CI pack
tarball.

See [**docs/phases.md**](docs/phases.md) for progress and **👤 decisions**.

## Output format

All tracks compile to the same **LJB `AuthorityCandidate` NDJSON** shape (see leaf-writer `autoTagging/authority.ts`). Each pack ships a `manifest.json` (id, version, sha256, license, upstream). Large packs may additionally advertise date chunks, while small and legacy packs remain single-file NDJSON.

## License

GPL-2.0 (leaf-writer). Upstream data licenses vary per source — each manifest records attribution.

### Regional map assets

The `china.pmtiles`, `japan.pmtiles`, and `tibet.pmtiles` release assets are
generated in CI from the current [Protomaps daily OpenStreetMap-derived
build](https://docs.protomaps.com/pmtiles/download). They are regional
extracts, not original Protomaps data. Protomaps distributes its basemap data
under the [OpenStreetMap ODbL](https://www.openstreetmap.org/copyright); users
must retain the required OpenStreetMap attribution and share-alike notices.
The extraction tool is [go-pmtiles](https://github.com/protomaps/go-pmtiles),
licensed under the BSD 3-Clause license. The release `map-tiles-index.json`
records the source build and checksums for each generated archive.
