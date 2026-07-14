# Wikidata pack build

Offline pipeline to turn [Wikidata](https://www.wikidata.org/) dumps into **tag string packs** for LJB auto-tagging.

**Roadmap:** [docs/phases.md](../docs/phases.md) (track **W**).  
**Design detail:** [leaf-writer `docs/wikidata-tag-packs-planning.md`](../../leaf-writer/docs/wikidata-tag-packs-planning.md).

**Status (2026-07-06):** W2 **done** — Tang pack compiled (34,923 persons). LJB load (track **L**) not started.

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

### 3. Extract from the full dump (one scan, many dynasties)

**Recommended:** extract all **priority-1** Chinese dynasties in **one pass** (唐/宋/元/明/清), then compile each pack separately.

This scans the entire dump once. **Expect several hours** and high CPU; RAM stays modest (streaming writes + checkpoints).

```bash
cd "/Users/daniel/Code/authority extraction"

npm run wikidata:extract -- \
  --dump "/path/to/latest-all.json.bz2" \
  --priority 1 \
  --language zh-hant \
  --out packs/wikidata/raw-zh-hant-priority1 \
  --progress 500000
```

**Stop and resume:** press Ctrl+C (or close terminal — prefer `tmux`). Progress is saved to `extract.checkpoint.json`. Re-run the **same command** with `--resume`:

```bash
npm run wikidata:extract -- \
  --dump "/path/to/latest-all.json.bz2" \
  --priority 1 \
  --language zh-hant \
  --out packs/wikidata/raw-zh-hant-priority1 \
  --progress 500000 \
  --resume
```

Resume re-reads the dump from the start but **skips** entities already scanned (decompression time only — matched rows are kept). Checkpoints write every 500k entities by default (`--checkpoint-every N` to change).

**Single dynasty** (legacy / smoke on full dump):

```bash
npm run wikidata:extract -- \
  --dump "/path/to/latest-all.json.bz2" \
  --dynasty tang \
  --language zh-hant \
  --out packs/wikidata/raw-tang \
  --progress 500000
```

**Custom list:** `--dynasties tang,song,ming,yuan,qing`

**Outputs:**

| File | Purpose |
|------|---------|
| `…/persons.raw.ndjson` | Master raw — one line per person (any selected dynasty); includes full `p27[]` |
| `…/extract-meta.json` | Final stats when complete (`entitiesScanned`, `personsMatched`, `dynastyIds`) |
| `…/extract.checkpoint.json` | Milepost while running or after interrupt (removed when complete) |

**Sanity check (Tang-only):** ~**37k** persons with `--dynasty tang`. Priority-1 master raw should be **much larger** (Song/Ming/Qing each add tens of thousands).

### 4. Compile tag packs from master raw

One dynasty:

```bash
npm run wikidata:compile -- \
  --raw packs/wikidata/raw-zh-hant-priority1/persons.raw.ndjson \
  --dynasty tang \
  --language zh-hant \
  --out packs/wikidata/person-zh-hant-tang
```

All priority-1 dynasties at once:

```bash
npm run wikidata:compile-all -- \
  --raw packs/wikidata/raw-zh-hant-priority1/persons.raw.ndjson \
  --priority 1 \
  --language zh-hant
```

Writes `packs/wikidata/person-zh-hant-{tang,song,yuan,ming,qing}/persons.ndjson` — compile filters by `p27` per dynasty.

### Pre-Ming pack (Song, Yuan, and earlier)

Wikidata often omits `P27` for Song/Yuan persons. Use **`--membership pre-ming`** to extract a broader raw file, then compile the pre-Ming slice:

```bash
# Full dump — one pass (several hours); resume with --resume
npm run wikidata:extract-pre-ming -- \
  --dump "/path/to/latest-all.json.bz2" \
  --language zh-hant \
  --out packs/wikidata/raw-zh-hant-pre-ming \
  --progress 500000

# Compile pre-Ming pack (death/birth ≤ 1367, or pre-Ming P27 / P2348)
npm run wikidata:compile-pre-ming -- \
  --raw packs/wikidata/raw-zh-hant-pre-ming/persons.raw.ndjson \
  --language zh-hant \
  --out packs/wikidata/person-zh-hant-pre-ming
```

**Membership rules:** include `zh-hant` humans when any of: pre-Ming dynasty on `P27` or `P2348`; or death year ≤ **1367**; or birth year ≤ 1367 when death is missing. At compile time, undated Ming/Qing-only rows are dropped.

You can also compile pre-Ming from an existing priority-1 raw (mostly Tang overlap) while waiting for a pre-Ming extract:

```bash
npm run wikidata:compile-pre-ming -- \
  --raw packs/wikidata/raw-zh-hant-priority1/persons.raw.ndjson \
  --out packs/wikidata/person-zh-hant-pre-ming
```

Or add `--pre-ming` to `wikidata:compile-all`.

### Japanese persons (`ja`) — IME kana in raw

**Do not use `--priority 1` with `--language ja`.** Priority 1 selects **Chinese dynasties** (唐/宋/元/明/清) on `P27`, so you only get ~5,600 historical Chinese figures that happen to have Japanese labels — not Japanese nationals.

For Japanese people, filter **`P27 = Japan (Q17)`**:

```bash
npm run wikidata:extract -- \
  --dump "/path/to/latest-all.json.bz2" \
  --membership country \
  --country japan \
  --language ja \
  --out packs/wikidata/raw-ja-japan \
  --progress 500000
```

Wikidata Query Service count for this slice: **~252,000** humans with a `ja` label and `P27 = Q17` (2026-07). NDL persons (~1M) remain the primary Japanese pack; this is the long-tail supplement.

When extracting with `--language ja`, each raw row can include hiragana readings for IME use (not added to tagger `searchStrings`):

| Raw field | Source |
|-----------|--------|
| `yomiHiragana` | Primary reading (hiragana) |
| `nameInKana` | All readings (hiragana), deduped |

Sources: Wikidata **P1814** (name in kana), optional `ja-Hira` / `ja-Kana` labels, kana-only `ja` aliases, and kana-primary `ja` labels.

```bash
npm run wikidata:extract -- \
  --dump "/path/to/latest-all.json.bz2" \
  --membership country \
  --country japan \
  --language ja \
  --out packs/wikidata/raw-ja-japan \
  --progress 500000
```

Compile:

```bash
npm run wikidata:compile -- \
  --raw packs/wikidata/raw-ja-japan/persons.raw.ndjson \
  --country japan \
  --language ja \
  --out packs/wikidata/person-ja-japan
```

Example raw row:

```json
{
  "qid": "Q180903",
  "primaryLabel": "夏目漱石",
  "yomiHiragana": "なつめ そうせき",
  "nameInKana": ["なつめ そうせき"]
}
```

**Outputs per pack:**

Entity count here may be **slightly lower** than raw (e.g. 李某-style placeholders compile to zero strings and are dropped).

### 5. Review (you, ~15 minutes)

1. Open `persons.ndjson` — skim ~30 random lines; do names look like real mention forms?
2. Re-run ambiguity on the **compiled** pack:
   ```bash
   npm run wikidata:report
   ```
   → `reports/w3-ambiguity.csv` (all ambiguous surfaces, with sample Q-ids and primary names)
3. **Name-filter tuning is deferred** — note false positives/negatives for a later pass.

### 6. Not ready yet — do not expect these to work

| Item | Status |
|------|--------|
| Load pack in Leaf-Writer Settings / tag bomb | Track **L** — not wired |
| GitLab CI bundle for Wikidata | Track **W5** |
| Automatic updates | **W5** |

When you resume Wikidata work, next engineering steps are **W3** (quality/ambiguity report) and **L1** (LJB pack install path).

### Authority concordance (external ids)

Every Wikidata extract copies listed **external-id properties** from the dump into `crosswalk` on each raw row, then into compiled `metadata.crosswalk` (alongside `wikidata: [qid]`). Configure properties in [`identifierProperties.json`](identifierProperties.json):

| Crosswalk key | Wikidata property | Use |
|---------------|-------------------|-----|
| `cbdb` | P497 | CBDB person id |
| `dila` | P1187 / P1188 | DILA person / place id |
| `viaf` | P214 | VIAF cluster id |
| `ndl` | P349 | NDL authority id |
| `chgis` | P4711 | CHGIS place id |
| `bdrc` | P2477 | BDRC resource id |

Re-extract + recompile packs to populate concordance fields on existing slices.

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
| [`identifierProperties.json`](identifierProperties.json) | External-id P-properties → crosswalk keys (CBDB, DILA, VIAF, NDL, CHGIS, BDRC) |
| [`identifierClaims.mjs`](identifierClaims.mjs) | Read identifier claims from dump entities |
| [`entityParse.mjs`](entityParse.mjs) | Parse dump entity claims, labels, crosswalk ids |
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
| Type 4 字 | Retain the component in raw data, but do not synthesize `familyName + zi` for tag packs |
| Types 5/6 號 (longer than primary) | Include independently recorded full aliases **longer than** primary label |
| P734 family name | Prefer when present; else infer from label |

On a 500-row Tang sample, this drops ~17% of raw strings (mostly bare 字 and 行第).

### Pack id convention

`wikidata-{kind}-{language}[-{period}]` — e.g. `wikidata-person-zh-hant-tang`.

## Later phases (not built yet)

| Phase | Deliverable |
|-------|-------------|
| W1 | **In progress** — `run-sparql.mjs` + reports |
| W2 | **In progress** — `extract.mjs` + `compile.mjs` |
| W3 | Quality gates, ambiguity CSV — **`wikidata/report.mjs`** |
| W4 | `compile.mjs` → LJB `AuthorityCandidate` NDJSON |
| W5 | Publish packs + manifest hosting |

LJB download UI + tag bomb wiring stays in **leaf-writer** (track **L**).

## License

Wikidata structured data is [CC0](https://www.wikidata.org/wiki/Wikidata:Database_download). Build scripts here are GPL-2.0 (same as leaf-writer). Generated manifests must credit Wikidata.
