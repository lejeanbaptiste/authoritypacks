# Norbert compile

Compiles a local Norbert MySQL dump → LJB `AuthorityCandidate` NDJSON for persons and offices.

## Input

Place a mysqldump under `norbert_secret/` (gitignored). The compile reads:

| Table | Use |
|-------|-----|
| `person` | `id`, `can_name`, `description`, `mythical` |
| `person_names` | typed alternate names |
| `codes_person_name_type` | mapped in [`constants.mjs`](./constants.mjs) |
| `person_date_filter` | upstream date rows; not exported as person birth/death dates |
| `nat_raw` | `court_id` → dynasty via `date_dynasties` |
| `person_origin` | source-preserving place-of-origin strings and qualifications |
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

The default allowlist is `person`, `person_names`, the Norbert `date_*` tables, `nat_raw`, `person_origin`, `office`, `person_offices`, and `biblio_work_names`. Biography/date-filter/death/residence/height tables, `test_*`, `knowledge_*`, and other `biblio_*` tables are excluded. Additional approved tables must be named explicitly with `--tables table_a,table_b`.

Output:

| File | Use |
|------|-----|
| `packs/norbert/persons.ndjson` | Tag bomb → `persName` |
| `packs/norbert/offices.ndjson` | Tag bomb → `roleName` |
| `packs/norbert/appointments.ndjson` | Person-to-office assertions for person disambiguation and entity import |
| `packs/norbert/person-wrappers.ndjson` | Longest-first, transient person-wrapper combinations from `person_nt` |
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

## Office entities and structure

Every Norbert `office` row retains its source id and compiles to `kind: office`
with `metadata.teiTag: roleName` and a provisional
`norbert:office:{office.id}` entity id. All structural flags, components,
date bounds, and notes from the table are preserved.

| Field | Source | Meaning |
|-------|--------|---------|
| `followsPlace` | `office.follows_place` | Typically follows a placeName |
| `geoAdminSuffix` | `follows_place` or known suffix (令/太守/刺史) | Wrap preceding place into roleName |
| `placeCat` | `office.cat` or Norbert custom rules | 縣/郡/州 on wrapped placeName |
| `isNobleTitle` | `office.is_noble_title` | Noble-title pattern tagging |
| `parentString` / `parentIsSite` | parent columns | Office parent evidence or place context |
| `followsOffice` | `office.follows_office` | Infer first office as parent when concatenated |

Unique, non-place `parentString` matches are exported as inferred `parentOf`
rows in `office-relations.ndjson`. Place parents are not converted into office
hierarchy.

The bundle build compares Norbert offices with CBDB by exact normalized name
and compatible period. It links only a single compatible CBDB result; homonyms
remain unresolved. Accepted links are recorded in
`office-concordance.ndjson`, and CBDB's office id becomes the canonical entity
id while the Norbert row id remains as provenance.

Implementation: [`compileOffices.mjs`](./compileOffices.mjs).

## Person-wrapper export

`compile.mjs` also reads Norbert's `person_nt` table and emits
`person-wrappers.ndjson`. Each record preserves the person ID and separate
wrapper components—dynasty/nationality, fief, noble rank, posthumous or temple
name, and personal-name variants—alongside the generated search strings.

These records are matcher input only. They are not merged into
`persons.ndjson`, and they must never be imported into a user's `entities.xml`
as hypothetical persons. The SQL field mapping is documented in
`SQL/person_wrapper_export.sql`.

## Name-type policy

Childhood names (小名 / 小字, types 5–6) are excluded, mirroring CBDB policy.

### Norbert → LJB mapping

| Norbert id | Chinese | LJB type |
|------------|---------|----------|
| — (`can_name`) | — | `primary` |
| 0 | 姓 | `family` |
| 1 | 名 | `given` |
| 2 | 字 | `courtesy` (imported one-to-one) |
| 3 | 賜號 | `variant` (longer than primary) |
| 4 | 室名 | `art` (longer than primary) |
| 7 | 本姓 | `variant` |
| 8 | 本名 | `birth` |
| 9 | 諡號 | `posthumous` (longer than primary) |
| 10 | 法號 | `dharma` |
| 11 | 俗姓 | `variant` (imported one-to-one) |
| 12 | 俗名 | `variant` (imported one-to-one) |
| 13 | 道號 | `dharma` |
| 14 | 尊號 | `variant` (length ≥ primary) |
| 15 | uncategorised | `variant` |
| 16 | 賜姓 | `variant` |
| 17 | 廟號 | `temple` |

Global string filters reuse [`shared/personStringPolicy.mjs`](../shared/personStringPolicy.mjs).

Implementation: [`personNames.mjs`](./personNames.mjs) emits both `searchStrings[]` and typed `names[]`.
