# Norbert compile

Compiles a local Norbert MySQL dump → LJB `AuthorityCandidate` NDJSON for persons and offices.

## Input

Keep the full private dump out of git. Sanitize it first (below), then compile from the reduced public SQL.

| Table | Use |
|-------|-----|
| `person` | People: `id`, one-line `can_name` / `description` |
| `person_names` | Typed names (姓/名/字/…) for tagging + intake |
| `codes_person_name_type` | Interpret `person_names.name_type_id` (mapped in [`constants.mjs`](./constants.mjs)) |
| `nat_raw` | Nationality evidence + extra person/dynasty pairs (`court_id`) |
| `person_dynasties` | Clean person↔dynasty links (unioned with `nat_raw`, deduped at compile) |
| `person_origin` | Origin strings (kept; lower priority) |
| `office` | Office/role catalogue for `roleName` tag bomb |
| `officeholding_raw` | Appointments |
| `person_nt` | Noble titles → also person-wrappers |

Dynasty **labels** are not shipped as SQL (`date_*` stays private). Sanitize writes `dynasty-labels.json` beside the reduced dump; `norbert/sqlToSqlite.mjs` embeds them as table `dynasty_labels` in the **reference** `norbert.sqlite3` (A6 lookup). Compile for tagging packs still loads the sidecar or extracts from a private dump.

### Reference sqlite (A6)

```bash
npm run norbert:sqlite -- --sql norbert_secret/norbert-authority.sql \
  --labels norbert_secret/dynasty-labels.json \
  --out dist/reference/norbert.sqlite3
# or with the release bundle:
npm run build:reference
```

Shipped with stripped CBDB in `authority-reference-person-*.zip` (GitHub releases). Tagging NDJSON remains a separate artifact.

## Run

```bash
npm run compile:norbert
# or
node norbert/compile.mjs --sql norbert_secret/norbert-authority.sql --out packs/norbert
```

## Reduced public extract

Keep the full SQL dump private and create a minimal authority-only copy:

```bash
node norbert/sanitizeDump.mjs \
  --sql /path/to/norbert_PRIVATE.sql \
  --out norbert_secret/norbert-authority.sql
```

**Allowlist (strict — no `date_*` passthrough):** `person`, `person_names`, `codes_person_name_type`, `nat_raw`, `person_dynasties`, `person_origin`, `office`, `officeholding_raw`, `person_nt`.

**Excluded:** all `biblio_*`, all `date_*`, other `*_raw` tables, `person_biographies`, `person_date_filter`, `person_death_raw`, `person_height`, `place`, `ruler`, `test_*`. Additional approved tables must be named explicitly with `--tables table_a,table_b`.

From this extract the pipeline produces two kinds of public artifact:

1. **Tagging pack** — lean `persons.ndjson` / `offices.ndjson` / `person-wrappers.ndjson` with expanded `searchStrings` from `person_names` (and wrappers from `person_nt`).
2. **Intake / disambiguation** — full compiled person records (typed names, deduped nationalities, origins, appointments, noble titles) via the same pack files / `exportEntities` path.

Output:

| File | Use |
|------|-----|
| `packs/norbert/persons.ndjson` | Tag bomb → `persName` (+ intake metadata) |
| `packs/norbert/offices.ndjson` | Tag bomb → `roleName` |
| `packs/norbert/appointments.ndjson` | Person-to-office assertions for person disambiguation and entity import |
| `packs/norbert/person-wrappers.ndjson` | Longest-first, transient person-wrapper combinations from `person_nt` |
| `packs/norbert/surnames.json` | Person name split (plugin) |
| `packs/norbert/geo-admin-suffixes.json` | Place+office concatenate pass (plugin, future) |
| `packs/norbert/manifest.json` | Pack metadata |
| `norbert_secret/dynasty-labels.json` | Dynasty id → zh/en/years (sidecar from sanitize) |

## Person concordance

Build strict, reviewable links from Norbert to compiled CBDB, DILA, and/or Wikidata person packs:

```bash
node norbert/concordance.mjs --norbert packs/norbert \
  --cbdb packs/cbdb --dila packs/dila --wikidata packs/wikidata/person-zh-hant-pre-ming \
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

Implementation: [`personNames.mjs`](./personNames.mjs) emits typed `names[]` for intake (no min-length / tag-bomb filters) and separately filtered `searchStrings[]` for tagging. Family/given stay in `names[]` only for tagging (aligned with CBDB: seeds are expanded full forms, not bare 姓/名).
