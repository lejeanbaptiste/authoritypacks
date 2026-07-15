# CBDB compile

Compiles CBDB sqlite → LJB `AuthorityCandidate` NDJSON.

## v1 policy (👤 signed 2026-07-05)

Implementation: [`personAltNames.mjs`](./personAltNames.mjs) + [`constants.mjs`](./constants.mjs).

### Always excluded (type codes)

| Code | Label |
|------|--------|
| 0 | Unknown |
| 7 | Birth-order name 行第 |
| 9, 10 | Childhood names 小名 / 小字 |
| 16 | Temple plaque 廟額 |
| 17 | Other transliteration (Latin — filtered anyway) |

Type **0** stays **out** (~45k strings). Mythical persons are **in** (no special filter).

### Primary name

- Always include `c_name_chn`.

### Alternative names — per-type rules

| Type | Label | Rule |
|------|--------|------|
| 3 | Alias / 曾用名 | Include only if **longer than** `c_name_chn` |
| 4 | Courtesy 字 | **`c_surname_chn` + `c_alt_name_chn`** (not bare 字) |
| 5, 6 | 別號 / 諡號 | Include only if **longer than** `c_name_chn` |
| 8, 11, 14, 19, 20 | 封爵, 賜號, 廟號, 法號, 道號 | Include as stored |
| 15 | 尊號 | Include if **length ≥** `c_name_chn` |
| 12 + 13 | 俗姓 + 俗名 | **Concatenate** each pair |
| 18 | 本姓 | **`c_alt_name_chn` + `c_mingzi_chn`** when alt is surname-length only; else use as stored |

### Global filters (all strings)

- Drop anything with symbols `* ( [ -` or **Latin letters**.
- Drop **single characters** after concatenation (min **2** code points).
- Block **`c_surname_chn` + 氏** and **`c_surname_chn` + 某** (ambiguous placeholder names).
- Block any **two-character `X某` placeholder** (e.g. 李某) — shared with Wikidata in [`shared/personStringPolicy.mjs`](../shared/personStringPolicy.mjs).

### Offices

- `kind: office`, `metadata.teiTag: roleName` at match time (no entity mint in v1).

### Typed names (`names[]`) — 👤 signed 2026-07-15

Every string in `searchStrings` is also emitted as a `{ text, type }` entry in
`names[]`, tagged with the LJB canonical name-type id
(`autoTagging/nameTypes.ts`: primary/courtesy/art/posthumous/temple/dharma/
pen/variant) via `CBDB_NAME_TYPE_MAP` in [`constants.mjs`](./constants.mjs).
This is what LJB's entity database uses to keep courtesy names (字) — common
words that make poor auto-tag seeds — out of corpus tagging by default while
still surfacing them for manual disambiguation and search.

| CBDB code | `c_name_type_desc_chn` | LJB type |
|-----------|------------------------|----------|
| — (`c_name_chn`) | — | `primary` |
| 3 | 別名、曾用名 | `variant` |
| 4 | 字 | `courtesy` |
| 5 | 室名、別號 | `art` |
| 6 | 諡號 | `posthumous` |
| 8 | 封爵 | `variant` |
| 11 | 賜號 | `variant` |
| 12 + 13 | 俗姓 + 俗名 | `variant` |
| 14 | 廟號 | `temple` |
| 15 | 尊號 | `variant` |
| 18 | 本姓 | `variant` |
| 19 | 法號 | `dharma` |
| 20 | 道號 | `dharma` (folded — see comment in `constants.mjs`) |

Implementation: `personNameEntriesFromAlts` in
[`personAltNames.mjs`](./personAltNames.mjs) is the single source of both
`searchStrings` (flat) and `names` (typed) — same inclusion/length-gate rules,
same dedup (first qualifying type wins for a given normalized string).

DILA has no equivalent: its TEI `persName/@type` only distinguishes
"alternative" from the primary name, not name category, so DILA-compiled
candidates ship without a `names` field (leaf-writer treats that as "no typed
names," same as any pre-this-feature pack).

## Run

```bash
npm run compile:cbdb
# or
node cbdb/compile.mjs --sqlite ../../leaf-writer/databases/cbdb_20260627.sqlite3 --out packs/cbdb
```

## Output

```
packs/cbdb/
  manifest.json
  persons.ndjson
  places.ndjson
  offices.ndjson
```

## 👤 Decisions still open

See [docs/phases.md](../docs/phases.md) track **C** — C2 ambiguity review, C3 publish host.
