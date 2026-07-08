# NDL (Web NDL Authorities) pack build

Offline pipeline to turn [Web NDL Authorities](https://id.ndl.go.jp/auth/ndla/) (国立国会図書館典拠データ) into **tag-string packs** for LJB auto-tagging on **Japanese** projects.

**Roadmap:** [docs/phases.md](../docs/phases.md) (track **N**).  
**LJB planning:** [leaf-writer `docs/authority-packs-planning.md`](../../leaf-writer/docs/authority-packs-planning.md) §4.6.

**Status (2026-07-07):** N1 pipeline done — persons (~1M) + works (~900) + places harvester (~7.8k). Kana readings wired into compile. LJB wired (Japanese lifecycle).

---

## License — OK for compiled packs

NDL states that Web NDL Authorities may be reused **for profit or non-profit without prior application**. When you publish outcomes, **attribute the source** (Web NDL Authorities / 国立国会図書館).

- [Terms of use (EN)](https://id.ndl.go.jp/information/termsofuse_en/)
- [Batch download info (EN)](https://id.ndl.go.jp/information/download_en/)

Compiled NDJSON packs distributed from GitLab (like CBDB/DILA) are fine **with attribution in `manifest.json`**. This matches your reading and our CBDB/DILA pack model.

---

## Critical: what batch download includes (and what it does not)

The [batch download files](https://id.ndl.go.jp/information/download_en/) are **not** a full dump of all authority types:

| Data | Batch TSV/RDF? | How to get it |
|------|----------------|---------------|
| **Works** (著作典拠) | Yes — tab-delimited, ~quarterly | Download from batch page |
| NDLSH topical terms, subdivisions | Yes — daily RDF/TSV | Batch page |
| Genre/form (NDLGFT) | Yes — TSV | Batch page |
| **Personal names** (個人名) | **No** | **SPARQL** only |
| **Corporate bodies** (団体名) | **No** | **SPARQL** only |
| **Geographic names** (as name authorities) | **No** (not in NDLSH batch scope) | **SPARQL** |

So **`ndl-persons-ja` and `ndl-places-ja` cannot be built from the batch TSV alone.** They need a SPARQL harvester (paginated queries, 1,000 rows per request on the [SPARQL 1.1 endpoint](https://id.ndl.go.jp/auth/ndla/sparql)).

**Good first target while learning the pipeline:** **`ndl-works-ja`** from the works batch file (smaller, truly bulk, good parser exercise).

---

## Target packs (v1)

| Pack id | Source | v1 priority |
|---------|--------|-------------|
| `ndl-persons-ja` | SPARQL 1.1 | Core value; **all** `foaf:Person` authorities (~1M), not authors-only |
| `ndl-works-ja` | Works batch TSV | **title** tag — ~900 著作典拠 in current batch |
| **`ndl-places-ja`** | SPARQL 1.1 | **Built** — geographic name authorities (~7.8k toponyms) |
| **`ndl-orgs-ja`** | SPARQL 1.1 | **Built** — corporate bodies (団体名, ~242k) |

No dynasty table (unlike Chinese packs). Date metadata comes from birth/death on person records when SPARQL provides it.

---

## When you are ready to start (operator checklist)

### Phase N0 — done in docs

- [x] License: reuse OK with attribution
- [x] Batch vs SPARQL scope understood (see table above)
- [ ] **You decide:** v1 packs = persons + works, or works-only first?

### Phase N1 — Works batch (recommended first)

```bash
cd "/Users/daniel/Code/authority extraction"

# If you don't have the TSV yet (or want a fresh copy):
curl -sL "https://id.ndl.go.jp/information/wp-content/uploads/2026/04/work-tsv.zip" \
  -o .upstream/ndl/work-tsv.zip
unzip -p .upstream/ndl/work-tsv.zip > .upstream/ndl/work-tsv.tsv

npm run ndl:parse-works -- --tsv .upstream/ndl/work-tsv.tsv --out packs/ndl/raw/works.raw.ndjson
npm run ndl:compile-works -- --raw packs/ndl/raw/works.raw.ndjson --out packs/ndl/works-ja
```

Expect ~900 work authority records in the current batch file.

### Phase N1b — Person names via SPARQL

```bash
npm run ndl:sparql -- count
npm run ndl:sparql -- sample --prefix 夏目 --limit 10

# Full harvest (~1.05M persons, ~1050 pages — allow ~1 hour with default delay):
# Uses keyset paging (NDL rejects OFFSET+LIMIT > 10,000).
npm run ndl:sparql -- harvest --out packs/ndl/raw/persons.raw.ndjson --delay-ms 300 --progress 10000

# Resume a partial harvest (keeps existing rows, continues after last authUri):
npm run ndl:sparql -- harvest --out packs/ndl/raw/persons.raw.ndjson --delay-ms 300 --progress 10000 --resume

npm run ndl:compile-persons -- --raw packs/ndl/raw/persons.raw.ndjson --out packs/ndl/persons-ja
```

**Namespace note:** NDL RDF uses `http://ndl.go.jp/dcndl/terms/` (trailing slash) and `http://RDVocab.info/ElementsGr2/` for birth/death — not the abbreviated URIs shown in some doc examples.

### Phase N1c — Place names via SPARQL

Geographic name authorities (`skos:inScheme ndla:geographicNames`). Subject subdivisions like `松山市--歴史` are **excluded** (`--` in label).

```bash
npm run ndl:sparql -- count-places
npm run ndl:sparql -- sample-places --prefix 東京 --limit 10

# Full harvest (~7.8k toponyms, ~8 pages at 1000/page — a few minutes):
npm run ndl:sparql -- harvest-places --out packs/ndl/raw/places.raw.ndjson --delay-ms 300 --progress 500

npm run ndl:compile-places -- --raw packs/ndl/raw/places.raw.ndjson --out packs/ndl/places-ja
```

Expect **~7,790** place authorities after filtering (37,709 in `geographicNames` scheme include subject headings).

### Phase N1d — Corporate bodies via SPARQL

Corporate name authorities (`skos:inScheme ndla:corporateNames`). Subject subdivisions like `東大寺--歴史` are **excluded** (`--` in label).

```bash
npm run ndl:sparql -- count-orgs
npm run ndl:sparql -- sample-orgs --prefix 東大 --limit 10

# Full harvest (~242k orgs, ~243 pages — allow ~1–2 hours with default delay):
npm run ndl:sparql -- harvest-orgs --out packs/ndl/raw/orgs.raw.ndjson --delay-ms 300 --progress 10000

npm run ndl:compile-orgs -- --raw packs/ndl/raw/orgs.raw.ndjson --out packs/ndl/orgs-ja
```

Expect **~242,384** corporate bodies after filtering.

### Phase N2 — Compile

- `ndl/compilePersons.mjs` / `ndl/compilePlaces.mjs` → LJB `AuthorityCandidate` NDJSON + manifest (same shape as CBDB/DILA).
- Search strings: kanji heading + **katakana/hiragana readings** from NDL `ndl:transcription` (`lang=ja-kana` on prefLabel and altLabel).
- Metadata: `yomi` (primary katakana) and `yomiHiragana` for IME/disambiguation UI.
- Readings are split into segment, concatenated, and both-script forms (e.g. `トウキョウト タイトウク`, `トウキョウトタイトウク`, `とうきょうと たいとうく`).

### Not ready yet

| Item | Status |
|------|--------|
| Leaf-Writer tag bomb checkbox for NDL | Track **L3** |
| GitLab CI bundle | Track **N4** |

---

## SPARQL notes (person prototype)

Endpoint: `https://id.ndl.go.jp/auth/ndla/sparql`  
Limit: **1,000 results per query** — harvest uses **keyset paging** (`FILTER (?auth > …)`), not OFFSET, because NDL rejects `OFFSET + LIMIT > 10,000`.  
Maintenance: unavailable ~5 minutes daily around 04:00 JST during data updates.

Example shape (from NDL docs — adjust prefixes in implementation):

```sparql
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX xl: <http://www.w3.org/2008/05/skos-xl#>
PREFIX ndl: <http://ndl.go.jp/dcndl/terms/>
PREFIX rda: <http://RDVocab.info/ElementsGr2/>

SELECT ?authUri ?heading ?yomi ?birth ?death WHERE {
  ?authUri foaf:primaryTopic ?entity .
  ?authUri xl:prefLabel [
    xl:literalForm ?heading ;
    ndl:transcription ?yomi
  ] .
  OPTIONAL { ?entity rda:dateOfBirth ?birth . }
  OPTIONAL { ?entity rda:dateOfDeath ?death . }
  FILTER (lang(?yomi) = "ja-Kana")
}
ORDER BY ?heading
LIMIT 1000
OFFSET 0
```

---

## Attribution string (for manifest.json)

> Data from Web NDL Authorities (National Diet Library).  
> 国立国会図書館の「Web NDL Authorities」から取得した典拠データです。
