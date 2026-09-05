# CBDB compile

Compiles CBDB sqlite → Grognard `AuthorityCandidate` NDJSON.

## Person reference sqlite (A6)

For link/backfill enrichment Grognard builds a **table-subset** `cbdb-person.sqlite3`
locally from CBDB's official release (not the full ~550 MB dump). Installed
on the user's machine only — Grognard does not redistribute this file.

```bash
npm run cbdb:strip-reference -- --sqlite .upstream/cbdb.sqlite3 --out dist/reference/cbdb-person.sqlite3
```

Tables kept: `BIOG_MAIN`, `ALTNAME_DATA`, `ALTNAME_CODES`, `DYNASTIES`, `BIOG_ADDR_DATA`, `ADDR_CODES`, `BIOG_ADDR_CODES`, `OFFICE_CODES`, `POSTING_DATA` / `ZZZ_POSTING_DATA`, `POSTED_TO_OFFICE_DATA` / `ZZZ_POSTED_TO_OFFICE_DATA`. See [`stripReferenceDb.mjs`](./stripReferenceDb.mjs). Per-id lookup: [`lookupPerson.mjs`](./lookupPerson.mjs).

**Hucker-cited office glosses:** left intact in this local reference sqlite
(as in CBDB's official release). Omitted only from **tagging packs we publish**
(`compileRecords.mjs` → `packs/cbdb/offices.ndjson`).

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
| 4 | Courtesy 字 | **`searchStrings`:** `姓` + bare 字 (strip 姓 if ALTNAME already has it). **`names[]`:** bare 字 only; prefixed + bare collapse via `collapseTypedNamesAfterZiClean`. |
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

- `kind: office`, `metadata.teiTag: roleName` at match time.
- `metadata.entityId` and `metadata.canonicalEntityId` are stable
  `cbdb:office:{c_office_id}` identifiers.
- `metadata.officeTypeIds` retains every `OFFICE_CODE_TYPE_REL` membership.
- Pinyin, translations, notes, source ids, and source pages from
  `OFFICE_CODES` are preserved as metadata when present.
- Pre-Han (`c_dy = 漢前`) offices use the office-type period (西周 / 春秋 /
  戰國) or a polity named in `c_notes` (e.g. 晋) for `metadata.dynasty` and
  the one-line `description`; definitional notes (e.g. 掌出使) are included as
  glosses. `參見` / `同 …` cross-reference notes are omitted from the clue.
- Near-duplicate pre-Han rows (same source dynasty 漢前, name, note, translation,
  and office-type ids) collapse to the lowest `c_office_id`; merged ids are listed
  in `office-concordance.ndjson`. Later-dynasty homonyms are never collapsed.
- Grognard may mint a project office entity after disambiguation; corpus mentions
  remain `roleName`.

CBDB's `OFFICE_TYPE_TREE` is a classification hierarchy, not a table of
appointments. It is exported intact. Tree edges are `parentOf`; links from an
office to a tree node are `belongsTo`.

### Appointments

`appointments.ndjson` contains source-preserving person-to-office assertions
from `POSTING_DATA` and `POSTED_TO_OFFICE_DATA`. It intentionally omits posting
dates and sequence for now. The bundle builder combines these rows with
Norbert `person_offices` assertions and attaches the resulting list to the
corresponding person candidates' metadata.

### Typed names (`names[]`) — 👤 signed 2026-07-15

`names[]` carries typed forms for entity intake (`autoTagging/nameTypes.ts`:
primary/courtesy/art/posthumous/temple/dharma/pen/variant/family/given) via
`CBDB_NAME_TYPE_MAP` in [`constants.mjs`](./constants.mjs). Phase-1
`searchStrings` overlap heavily with `names[]`, but **姓+字** courtesy
composites are search-only: `names[]` keeps the **bare 字** (and collapses
prefixed duplicates via `collapseTypedNamesAfterZiClean`). `names[]` also
carries bare 姓 / 名 / 字 and short 別號/諡號/尊號 that fail the phase-1 length
gates — too ambiguous for the matcher, still useful at link time.

This is what Grognard's entity database uses to keep courtesy names (字) — common
words that make poor auto-tag seeds — out of corpus tagging by default while
still surfacing them for manual disambiguation and search.

| CBDB code | `c_name_type_desc_chn` | Grognard type |
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

Implementation: `buildPersonNamesFromAlts` in
[`personAltNames.mjs`](./personAltNames.mjs) is the single source of both
`searchStrings` (phase-1 matcher only) and `names` (typed, superset) — dedup
within each list matches the original Set-based behavior (first qualifying
type wins for a given normalized string).

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
  person-concordance.ndjson
  places.ndjson
  offices.ndjson
  office-types.ndjson
  office-relations.ndjson
```

`person-concordance.ndjson` preserves CBDB's `MERGED_PERSON_DATA` rows.
Persons participating in a merge receive the same
`metadata.canonicalEntityId` (`cbdb:person:<canonical CBDB id>`), so the Grognard
entity importer groups the canonical record and its duplicates into one local
entity while retaining each CBDB authority ID.

## 👤 Decisions still open

See [docs/phases.md](../docs/phases.md) track **C** — C2 ambiguity review, C3 publish host.
