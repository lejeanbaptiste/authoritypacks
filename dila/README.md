# DILA compile

Streams DILA person + place TEI XML → LJB `AuthorityCandidate` NDJSON.

## v1 policy

| Rule | Default |
|------|---------|
| Match strings | `zho-Hant` `persName` / `placeName` only |
| Min match length | 2 code points |
| Period metadata | birth/death years when present; else dynasty note → static alias table |
| Places without dates | Included always (no silent exclusion) |
| Crosswalk | `idno type="CBDB"` and `Wikidata` stored in `metadata.crosswalk` |

## Run

```bash
npm run compile:dila
```

## 👤 Decisions still open

- Include `ana="mythical"` persons or flag only? (currently compiled with `metadata.ana`)
- Extra name variants from notes?

See [docs/phases.md](../docs/phases.md) track **D**.
