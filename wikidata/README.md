# Wikidata pack build

Offline pipeline to turn [Wikidata](https://www.wikidata.org/) dumps into **tag string packs** for LJB auto-tagging.

**Roadmap:** [docs/phases.md](../docs/phases.md) (track **W**).  
**Design detail:** [leaf-writer `docs/wikidata-tag-packs-planning.md`](../../leaf-writer/docs/wikidata-tag-packs-planning.md).

**Status (2026-07-05):** W2 full dump extract **running** on `~/Downloads/latest-all.json.bz2` (95 GB). Compile when extract finishes; LJB load (track **L**) not started.

---

## When the dump download finishes

You are downloading **`latest-all.json.bz2`** from [Wikidata dumps](https://dumps.wikimedia.org/wikidatawiki/entities/) (~100 GB compressed). When the file is complete on disk, do this:

### 1. Check the file

- Path: note where you saved it (example: `~/Downloads/latest-all.json.bz2`).
- Size: compressed file should be on the order of **90–100 GB**. If the download stopped early, re-fetch before extracting.
- Tooling: **`bzcat`** must be available (macOS includes it). The extractor streams through `bzcat` — you do **not** need to decompress the whole file to disk.

### 2. Smoke test (optional, ~1 second)

Confirms the scripts work before the long run:

```bash
cd "/Users/daniel/Code/authority extraction"

npm run wikidata:extract -- \
  --dump wikidata/fixtures/tang-persons.jsonl \
  --dynasty tang \
  --language zh-hant \
  --out packs/wikidata/raw-tang

npm run wikidata:compile -- \
  --raw packs/wikidata/raw-tang/persons.raw.ndjson \
  --dynasty tang \
  --language zh-hant \
  --out packs/wikidata/person-zh-hant-tang
```

Expect **3** persons in `packs/wikidata/person-zh-hant-tang/persons.ndjson` (李白, 李益, fictional 虬髯客; 李某 is dropped as a placeholder).

### 3. Extract Tang persons from the full dump

This scans the entire dump once. **Expect several hours** and high CPU; RAM stays modest (streaming).

```bash
cd "/Users/daniel/Code/authority extraction"

npm run wikidata:extract -- \
  --dump "/path/to/latest-all.json.bz2" \
  --dynasty tang \
  --language zh-hant \
  --out packs/wikidata/raw-tang \
  --progress 500000
```

**Outputs:**

| File | Purpose |
|------|---------|
| `packs/wikidata/raw-tang/persons.raw.ndjson` | One JSON line per Tang person (labels, aliases, dates) |
| `packs/wikidata/raw-tang/extract-meta.json` | Scan stats (`entitiesScanned`, `personsMatched`) |

**Sanity check:** `personsMatched` should be **roughly ~37k** (W1 SPARQL count was 37,033). Within ~10% is fine; a huge mismatch means wrong dump file or filter bug — stop and investigate.

### 4. Compile the tag pack

Applies CBDB-aligned name rules (字/某/行第) and writes LJB-shaped NDJSON:

```bash
npm run wikidata:compile -- \
  --raw packs/wikidata/raw-tang/persons.raw.ndjson \
  --dynasty tang \
  --language zh-hant \
  --out packs/wikidata/person-zh-hant-tang
```

**Outputs:**

| File | Purpose |
|------|---------|
| `packs/wikidata/person-zh-hant-tang/persons.ndjson` | `AuthorityCandidate` rows for tag bomb |
| `packs/wikidata/person-zh-hant-tang/manifest.json` | Pack metadata (CC0, dynasty, counts) |

Entity count here may be **slightly lower** than raw (e.g. 李某-style placeholders compile to zero strings and are dropped).

### 5. Review (you, ~15 minutes)

1. Open `persons.ndjson` — skim ~30 random lines; do names look like real mention forms?
2. Re-run ambiguity on the **compiled** pack when W3 tooling exists, or spot-check known names in `gold_test.xml` manually.
3. **Name-filter tuning is deferred** — note false positives/negatives for a later pass.

### 6. Not ready yet — do not expect these to work

| Item | Status |
|------|--------|
| Load pack in Leaf-Writer Settings / tag bomb | Track **L** — not wired |
| GitLab CI bundle for Wikidata | Track **W5** |
| Automatic updates | **W5** |

When you resume Wikidata work, next engineering steps are **W3** (quality/ambiguity report) and **L1** (LJB pack install path).

---

## Phase W0 (reference tables) — done

Configuration tables every later phase reads. No dump processing yet.

| File | Purpose |
|------|---------|
| [`dynasties.json`](dynasties.json) | Chinese period presets: Wikidata Q-id, year range, labels, DILA/CBDB aliases |
| [`kind-queries.json`](kind-queries.json) | Which `P31` roots qualify as person / place / org / work |
| [`languages.json`](languages.json) | Pack languages ↔ LJB project codes ↔ Wikidata label tags |
| [`schema.json`](schema.json) | JSON Schema (documentation) |
| [`validate.mjs`](validate.mjs) | Sanity-check after editing tables |
| [`queries.mjs`](queries.mjs) | SPARQL builders for W1 prototypes |
| [`entityParse.mjs`](entityParse.mjs) | Parse dump entity claims and labels |
| [`personSearchStrings.mjs`](personSearchStrings.mjs) | CBDB-aligned person string rules |
| [`extract.mjs`](extract.mjs) | Stream Wikidata dump → raw person NDJSON (W2) |
| [`compile.mjs`](compile.mjs) | Raw → LJB `AuthorityCandidate` pack (W4) |

### Validate

```bash
npm run validate
```

### W1 — SPARQL prototypes

Prototypes hit [Wikidata Query Service](https://query.wikidata.org/) (network required). CSV reports go to `reports/` (gitignored).

```bash
# Tang persons, traditional Chinese — row count
npm run wikidata:sparql -- count --dynasty tang --language zh-hant

# 500-row sample for manual label review
npm run wikidata:sparql -- sample --dynasty tang --language zh-hant

# Top ambiguous zh-hant strings in the Tang slice
npm run wikidata:sparql -- ambiguous --dynasty tang --language zh-hant

# CBDB-aligned name filter stats on a WDQS sample (字/某/行第 dropped)
npm run wikidata:sparql -- filtered-stats --dynasty tang --language zh-hant

# Count matrix for priority-1 dynasties (Tang, Song, Ming, Qing, …)
npm run wikidata:sparql -- matrix --language zh-hant

# Place supplement (no dynasty filter yet)
npm run wikidata:sparql -- place-count --language zh-hant

# W2 — extract + compile Tang person pack
npm run wikidata:extract -- --dump wikidata/fixtures/tang-persons.jsonl --dynasty tang --out packs/wikidata/raw-tang
npm run wikidata:compile -- --raw packs/wikidata/raw-tang/persons.raw.ndjson --dynasty tang --out packs/wikidata/person-zh-hant-tang
```

Review outputs before W2 dump extract. See [phases.md](../docs/phases.md) track **W1** checklist.

### Person name policy (Wikidata)

Wikidata has no CBDB altname type codes. [`personSearchStrings.mjs`](personSearchStrings.mjs) mirrors [`cbdb/README.md`](../cbdb/README.md) via [`shared/personStringPolicy.mjs`](../shared/personStringPolicy.mjs):

| CBDB rule | Wikidata heuristic |
|-----------|-------------------|
| Block 姓+某, 姓+氏 | Same; also block any two-char `X某` placeholder |
| Type 7 行第 | Drop aliases like 岑二十七, 杜十五 |
| Type 4 字 → 姓+字 only | Short aliases → `familyName + zi`; `子徴` → 姓+徴 |
| Types 5/6 號 (longer than primary) | Include aliases **longer than** primary label |
| P734 family name | Prefer when present; else infer from label |

On a 500-row Tang sample, this drops ~17% of raw strings (mostly bare 字 and 行第).

### Pack id convention

`wikidata-{kind}-{language}[-{period}]` — e.g. `wikidata-person-zh-hant-tang`.

## Later phases (not built yet)

| Phase | Deliverable |
|-------|-------------|
| W1 | **In progress** — `run-sparql.mjs` + reports |
| W2 | **In progress** — `extract.mjs` + `compile.mjs` |
| W3 | Quality gates, ambiguity CSV |
| W4 | `compile.mjs` → LJB `AuthorityCandidate` NDJSON |
| W5 | Publish packs + manifest hosting |

LJB download UI + tag bomb wiring stays in **leaf-writer** (track **L**).

## License

Wikidata structured data is [CC0](https://www.wikidata.org/wiki/Wikidata:Database_download). Build scripts here are GPL-2.0 (same as leaf-writer). Generated manifests must credit Wikidata.
