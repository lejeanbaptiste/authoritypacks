# Wikidata pack build

Offline pipeline to turn [Wikidata](https://www.wikidata.org/) dumps into **tag string packs** for LJB auto-tagging.

**Roadmap:** [docs/phases.md](../docs/phases.md) (track **W**).  
**Design detail:** [leaf-writer `docs/wikidata-tag-packs-planning.md`](../../leaf-writer/docs/wikidata-tag-packs-planning.md).

## Phase W0 (reference tables) — done

Configuration tables every later phase reads. No dump processing yet.

| File | Purpose |
|------|---------|
| [`dynasties.json`](dynasties.json) | Chinese period presets: Wikidata Q-id, year range, labels, DILA/CBDB aliases |
| [`kind-queries.json`](kind-queries.json) | Which `P31` roots qualify as person / place / org / work |
| [`languages.json`](languages.json) | Pack languages ↔ LJB project codes ↔ Wikidata label tags |
| [`schema.json`](schema.json) | JSON Schema (documentation) |
| [`validate.mjs`](validate.mjs) | Sanity-check after editing tables |

### Validate

```bash
npm run validate
```

### Pack id convention

`wikidata-{kind}-{language}[-{period}]` — e.g. `wikidata-person-zh-hant-tang`.

## Later phases (not built yet)

| Phase | Deliverable |
|-------|-------------|
| W1 | SPARQL prototypes + count/ambiguity reports in `reports/` |
| W2 | `extract.mjs` — stream dump → raw pack NDJSON |
| W3 | Quality gates, ambiguity CSV |
| W4 | `compile.mjs` → LJB `AuthorityCandidate` NDJSON |
| W5 | Publish packs + manifest hosting |

LJB download UI + tag bomb wiring stays in **leaf-writer** (track **L**).

## License

Wikidata structured data is [CC0](https://www.wikidata.org/wiki/Wikidata:Database_download). Build scripts here are GPL-2.0 (same as leaf-writer). Generated manifests must credit Wikidata.
