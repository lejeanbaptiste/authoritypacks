# Authority extraction

Offline **build pipelines** that turn public authority sources (CBDB, DILA, Wikidata, NDL, GeoNames, …) into **tag-string packs** for [LEAF/LJB](https://gitlab.com/calincs/cwrc/leaf-writer/leaf-writer) auto-tagging.

This repo holds **extract → compile → publish** tooling. The **matcher, review UI, and tag bomb** live in leaf-writer.

## Start here

| Doc | What it covers |
|-----|----------------|
| [**docs/phases.md**](docs/phases.md) | Master roadmap — all sources, human checkpoints |
| [**wikidata/README.md**](wikidata/README.md) | Wikidata config tables + validator (W0 done) |

Leaf-writer companions (integration, not extraction):

- [authority-packs-planning.md](../leaf-writer/docs/authority-packs-planning.md) — strategy
- [authority-databases-phases.md](../leaf-writer/docs/authority-databases-phases.md) — CBDB/DILA in-app (tracks **A**, **L**)

## Layout

```
authority extraction/
  docs/phases.md          # roadmap + progress dashboard
  shared/                 # normalize, clue, ndjson, teiParse, dynastyMap
  cbdb/                   # compile + report (C1–C2 done)
  dila/                   # compile (D1 done)
  wikidata/               # Wikidata track (W0 done)
  packs/                  # compiled NDJSON (gitignored)
  reports/                # ambiguity CSVs
```

## Quick start

```bash
npm test
npm run compile:cbdb
npm run compile:dila
node cbdb/report.mjs
```

**CI pack bundle** (same output GitLab produces):

```bash
npm run build:packs:full    # download pinned upstream + compile + dist/*.tar.gz
```

See [docs/ci-packs.md](docs/ci-packs.md).

See [**docs/phases.md**](docs/phases.md) for progress and **👤 decisions**.

## Output format

All tracks compile to the same **LJB `AuthorityCandidate` NDJSON** shape (see leaf-writer `autoTagging/authority.ts`). Each pack ships a `manifest.json` (id, version, sha256, license, upstream).

## License

GPL-2.0 (leaf-writer). Upstream data licenses vary per source — each manifest records attribution.
