# Norbert compile

Compiles a local Norbert MySQL dump → LJB `AuthorityCandidate` NDJSON for persons and offices.

## Input

Place a mysqldump under `norbert_secret/` (gitignored). The compile reads:

| Table | Use |
|-------|-----|
| `person` | `id`, `can_name`, `description`, `mythical` |
| `person_names` | typed alternate names |
| `codes_person_name_type` | mapped in [`constants.mjs`](./constants.mjs) |
| `person_date_filter` | birth/death years |
| `nat_raw` | `court_id` → dynasty via `date_dynasties` |
| `office` | office/role strings for `roleName` tag bomb |

## Run

```bash
npm run compile:norbert
# or
node norbert/compile.mjs --sql norbert_secret/norbert_humanum_YYYY-MM-DD.sql --out packs/norbert
```

## Reduced private export

Keep the full SQL dump private and create a minimal authority-only copy:

```bash
node norbert/sanitizeDump.mjs \
  --sql norbert_secret/norbert_humanum_YYYY-MM-DD.sql \
  --out norbert_secret/norbert-authority.sql
```

The default allowlist is `person`, `person_names`, the Norbert `date_*` tables, `nat_raw`, `office`, and `biblio_work_names`. Biography/date-filter/death/residence/height tables, `test_*`, `knowledge_*`, and other `biblio_*` tables are excluded. Additional approved tables must be named explicitly with `--tables table_a,table_b`.

Output:

| File | Use |
|------|-----|
| `packs/norbert/persons.ndjson` | Tag bomb → `persName` |
| `packs/norbert/offices.ndjson` | Tag bomb → `roleName` |
| `packs/norbert/surnames.json` | Person name split (plugin) |
| `packs/norbert/geo-admin-suffixes.json` | Place+office concatenate pass (plugin, future) |
| `packs/norbert/manifest.json` | Pack metadata |

## Person concordance

Build strict, reviewable links from Norbert to compiled CBDB, DILA, and/or Wikidata person packs:

```bash
node norbert/concordance.mjs --norbert packs/norbert \
  --cbdb packs/cbdb --dila packs/dila --wikidata packs/wikidata/person-zh-hant-song \
  --out packs/norbert/norbert-concordance.ndjson
```

Rows are emitted only when primary name, structured style name (字), and dynasty all match exactly after surface normalization. Sources lacking structured style or dynasty metadata are skipped; each row retains the matched source ID and evidence.

## Office metadata

Norbert `office` rows compile to `kind: office` with `metadata.teiTag: roleName`. Flags preserved for the concatenate pass:

| Field | Source | Meaning |
|-------|--------|---------|
| `followsPlace` | `office.follows_place` | Typically follows a placeName |
| `geoAdminSuffix` | `follows_place` or known suffix (令/太守/刺史) | Wrap preceding place into roleName |
| `placeCat` | `office.cat` or Norbert custom rules | 縣/郡/州 on wrapped placeName |
| `isNobleTitle` | `office.is_noble_title` | Noble-title pattern tagging |

Implementation: [`compileOffices.mjs`](./compileOffices.mjs).

## Name-type policy

Childhood names (小名 / 小字, types 5–6) are excluded, mirroring CBDB policy.

### Norbert → LJB mapping

| Norbert id | Chinese | LJB type |
|------------|---------|----------|
| — (`can_name`) | — | `primary` |
| 0 | 姓 | `family` |
| 1 | 名 | `given` |
| 2 | 字 | `courtesy` (prefixed with 姓 when known) |
| 3 | 賜號 | `variant` (longer than primary) |
| 4 | 室名 | `art` (longer than primary) |
| 7 | 本姓 | `variant` |
| 8 | 本名 | `birth` |
| 9 | 諡號 | `posthumous` (longer than primary) |
| 10 | 法號 | `dharma` |
| 11 + 12 | 俗姓 + 俗名 | `variant` (concatenated pairs) |
| 13 | 道號 | `dharma` |
| 14 | 尊號 | `variant` (length ≥ primary) |
| 15 | uncategorised | `variant` |
| 16 | 賜姓 | `variant` |
| 17 | 廟號 | `temple` |

Global string filters reuse [`shared/personStringPolicy.mjs`](../shared/personStringPolicy.mjs).

Implementation: [`personNames.mjs`](./personNames.mjs) emits both `searchStrings[]` and typed `names[]`.
