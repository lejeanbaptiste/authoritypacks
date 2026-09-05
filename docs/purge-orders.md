# Pack purge orders

Developer-authored **purge / concordance change notices** shipped inside the
authority-pack tarball. On install, Grognard queues them into a local docket for
**manual review** — they never silently rewrite `entities.xml`.

## Why

Pack updates can add or remove crosswalks. Tagging/disambiguation picks that
up from new pack files automatically. Project entities that already carry
`<idno>`s do not. Purge orders are the maintainer channel that says:

> “We changed these links; please review them in your project.”

Each order is labeled `from: "developer"` so the UI can mark it as coming from
the pack maintainers (you), not from an automatic PEDB merge.

## Ship format

```
authority-packs/purge-orders/purge-orders.ndjson
```

One JSON object per line (`shared/purgeOrders.mjs`):

| Field | Meaning |
|-------|---------|
| `id` | Stable id (dedupe key across installs) |
| `kind` | `concordance-unlink` / `concordance-link` / `concordance-replace` / `pack-note` |
| `from` | always `developer` |
| `note` | Human-readable explanation |
| `remove` / `add` | Optional `{ cbdb\|dila\|wikidata\|…: id }` maps |
| `source` / `authorityId` | Usually Norbert person id for person concordance diffs |
| `bundleVersion` | Pack bundle that introduced the order |

## Build

```bash
# Diff previous vs new accepted concordance
node scripts/build-purge-orders.mjs \
  --previous packs/norbert/concordance.prev.ndjson \
  --next packs/norbert/norbert-concordance.ndjson \
  --out packs/purge-orders/purge-orders.ndjson \
  --bundle-version 0.1.0

# Or let build-pack-bundle.mjs emit orders (uses concordance.prev.ndjson when present)
npm run build:packs
```

Keep the previously shipped concordance as `packs/norbert/concordance.prev.ndjson`
(or copy from the last release) so the next build can emit precise unlink/replace
orders.

## Client

- Install path: `installPackBundle` → `ingestPackPurgeOrdersFromInstall`
- Local docket: `authority-databases/pack-purge-orders.jsonl`
- Resolutions: `authority-databases/pack-purge-order-resolutions.jsonl`
- Helpers: `grognard/.../autoTagging/packPurgeDocket.ts`

**UI:** pending count / review dialog still to wire into Settings (data path is ready).
