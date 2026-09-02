# GitLab CI — authority pack builds

Pipeline stages: **test** → **build-packs**.

## What `build-packs` produces

| Artifact | Description |
|----------|-------------|
| `dist/packs-index.json` | Bundle version, policy, upstream pins, per-file sha256, tarball hash |
| `dist/authority-packs-{version}.tar.gz` | `authority-packs/cbdb/` + `authority-packs/dila/` and, when staged, `authority-packs/wikidata/` + `authority-packs/ndl/`, plus the curated `authority-packs/noble-title-filter/` policy pack, ready for LJB |
| `release/authority-reference-person-*.zip` | Sibling of tagging tarballs: `norbert.sqlite3` + `cbdb-person.sqlite3` + `manifest.json` (A6) |
| `release/reference-index.json` | Version + sha256 for LJB reference download |

Artifacts expire in **30 days** until you attach them to a GitLab **Release** (when ready). Build reference alone with `npm run build:reference`.

## Pinned upstream

Single source of truth: [`upstream/pins.json`](../upstream/pins.json) (mirrors leaf-writer `authorityDatabases.ts` pins for CBDB/DILA, plus NDL bundle metadata).

Bump pins when CBDB or DILA releases a new dump, then re-run the pipeline.

## NDL staging

CBDB and DILA are fetched automatically. NDL is different: the person harvest is generated locally from SPARQL and the works file is compiled from the NDL batch TSV.

`build-pack-bundle.mjs` includes the public reduced Norbert authority export, compiles the Norbert pack, and builds/integrates `norbert/concordance.ndjson` before packaging. The reduced SQL source is pinned in `upstream/pins.json` and stored at `norbert_public/norbert-authority.sql`; the full Norbert dump remains private and is never required by CI.

The curated noble-title filter is part of this tarball at
`authority-packs/noble-title-filter/`. It is generated from the reviewed table
at `noble-titles/reports/noble-title-authority-review.csv`; only accepted rows
are emitted. The separate Wikipedia-reviewed `wiki-nt-links.ndjson` asset
remains bundled inside `plugin-norbert` for person-wrapper disambiguation.

`build-pack-bundle.mjs` now includes NDL when these raw files already exist:

- `.upstream/ndl/raw/persons.raw.ndjson`
- `.upstream/ndl/raw/works.raw.ndjson`

Fallbacks for local dev:

- `packs/ndl/raw/persons.raw.ndjson`
- `packs/ndl/raw/works.raw.ndjson`

Optional metadata file:

- `.upstream/ndl/raw/persons.raw-meta.json`
- or `packs/ndl/raw/persons.raw-meta.json`

If those files are absent, the bundle still builds, but it will contain only CBDB + DILA.

For release-time enforcement, run the bundle with `--require-ndl`. That makes the build fail fast if the NDL raws are missing.

## Huckbot5000 and MaxiRicci7000 (chinese bundle)

Shippable gap-fill packs are **committed in git (LFS)**, not rebuilt in CI:

- `packs/huckbot5000/translations.ndjson` + `manifest.json`
- `packs/maxiricci7000/translations.ndjson` + `manifest.json`

Staging files (`candidates*.ndjson`, lexicon, batch targets) and **`packs/huckbot5000-insiders/`** (Hucker collision archive) stay gitignored. `npm run authoritypacks:release` **fails** if the two translation packs are missing.

Rebuild locally after review workflow changes:

```bash
npm run compile:huckbot5000-translations
npm run compile:maxiricci7000
git add packs/huckbot5000/translations.ndjson packs/huckbot5000/manifest.json \
        packs/maxiricci7000/translations.ndjson packs/maxiricci7000/manifest.json
```

## Wikidata staging

Wikidata person packs are **compiled locally** from the Wikidata JSON dump (see [`wikidata/README.md`](../wikidata/README.md)). They are not fetched by `fetch-upstream.mjs`.

`build-pack-bundle.mjs` includes Wikidata when these compiled directories already exist (pre-Ming / Ming / Qing — the person packs wired into LJB’s Chinese profile; Tang is optional):

- `.upstream/wikidata/person-zh-hant-pre-ming/persons.ndjson`
- `.upstream/wikidata/person-zh-hant-ming/persons.ndjson`
- `.upstream/wikidata/person-zh-hant-qing/persons.ndjson`

Fallbacks for local dev:

- `packs/wikidata/person-zh-hant-pre-ming/persons.ndjson`
- `packs/wikidata/person-zh-hant-ming/persons.ndjson`
- `packs/wikidata/person-zh-hant-qing/persons.ndjson`
- `packs/wikidata/person-zh-hant-tang/persons.ndjson` (optional)

Optional extract metadata (bundle version suffix):

- `.upstream/wikidata/extract-meta.json`
- or `packs/wikidata/raw-zh-hant-priority1/extract-meta.json`

If those directories are absent, the bundle still builds with CBDB + DILA only.

**GitLab CI:** both `packs/` and `.upstream/` are gitignored, so the runner does not have your compiled Wikidata unless you stage copies under `.upstream/wikidata/` on the machine that triggers the pipeline, or you build locally and attach `dist/` to a **Release** (recommended for the first publish with Wikidata). Same pattern as NDL.

Local compile + bundle:

```bash
# Prefer pre-Ming raw for Song/Yuan coverage; priority-1 alone is Tang-heavy
npm run wikidata:compile-pre-ming
npm run wikidata:compile-all -- --raw packs/wikidata/raw-zh-hant-priority1/persons.raw.ndjson
npm run build:packs
```

Tarball layout: `authority-packs/wikidata/person-zh-hant-{pre-ming,ming,qing}/persons.ndjson` (plus optional `tang`) and per-pack / bundle `manifest.json` files. LJB’s Chinese lifecycle maps to `wikidata-persons-pre-ming`, `wikidata-persons-ming`, `wikidata-persons-qing`.

**Song / Yuan:** included in **pre-Ming** (`--membership pre-ming`, death/birth ≤ 1367 or pre-Ming period claims). Separate `person-zh-hant-song` / `person-zh-hant-yuan` directories are obsolete `P27`-only leftovers — do not stage them in the bundle.

The **pre-Ming** pack uses date/P2348 membership (see [`wikidata/README.md`](../wikidata/README.md)); compile it from `raw-zh-hant-pre-ming` after a `--membership pre-ming` extract. Compiling pre-Ming from priority-1 raw alone is Tang-heavy and under-represents Song/Yuan.

## Tests in CI

CBDB unit tests use a committed **`cbdb/fixtures/sample.sqlite3`** (~25 KB) so the test job does not download the 600 MB dump. The optional integration test (`full dump person count`) runs only when a full sqlite is present locally or in `build-packs`.

Regenerate the fixture after compile-rule changes:

```bash
npm run create:cbdb-fixture   # needs full CBDB sqlite locally
```

## Local (same as CI)

```bash
npm ci
npm run build:packs:full    # fetch upstream + compile + tarball
# or, if you already have leaf-writer/databases/ or .upstream/:
npm run build:packs
```

To include NDL locally, make sure the NDL raw exports exist first:

```bash
npm run ndl:compile-works -- --raw packs/ndl/raw/works.raw.ndjson --out packs/ndl/works-ja
npm run ndl:compile-persons -- --raw packs/ndl/raw/persons.raw.ndjson --out packs/ndl/persons-ja
npm run build:packs
node scripts/build-pack-bundle.mjs --require-ndl
```

Output lands in `dist/`.

## Releases (later)

When ready for a public release:

1. Run pipeline on a **tag** (e.g. `packs-2026-07-05`).
2. GitLab → Releases → New release → attach `dist/authority-packs-*.tar.gz` and `packs-index.json` from the job artifacts.
3. LJB weekly check will point at the release asset URL (track A5 in leaf-writer).

Until then, download artifacts from the latest successful **build-packs** job on `main`.

## Manual run without pushing

GitLab → **CI/CD → Pipelines → Run pipeline** (branch: `main`).

To avoid automatic builds on every push to main, uncomment `when: manual` under `build-packs` in `.gitlab-ci.yml`.
