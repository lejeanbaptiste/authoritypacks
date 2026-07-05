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
