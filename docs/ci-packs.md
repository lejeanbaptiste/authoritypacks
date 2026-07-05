# GitLab CI — authority pack builds

Pipeline stages: **test** → **build-packs**.

## What `build-packs` produces

| Artifact | Description |
|----------|-------------|
| `dist/packs-index.json` | Bundle version, policy, upstream pins, per-file sha256, tarball hash |
| `dist/authority-packs-{version}.tar.gz` | `authority-packs/cbdb/` + `authority-packs/dila/` ready for LJB |

Artifacts expire in **30 days** until you attach them to a GitLab **Release** (when ready).

## Pinned upstream

Single source of truth: [`upstream/pins.json`](../upstream/pins.json) (mirrors leaf-writer `authorityDatabases.ts` pins).

Bump pins when CBDB or DILA releases a new dump, then re-run the pipeline.

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
