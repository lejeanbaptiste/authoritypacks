# MaxiRicci7000

High-quality **French** office-title glosses via GPT-4o, in two batches:

| Batch | Input | Method |
|---|---|---|
| **A** | Hucker OCR: Chinese + English title + **full definition** | GPT-4o + Robert des Rotours (`RR:`) seeds |
| **B** | CBDB / Huckbot offices **absent from Hucker** | GPT-4o + retrieval against Batch A French + mined French morpheme lexicon |

Named after Matteo Ricci — ambitious cross-linguistic glossary work. Not affiliated with *Grand Ricci*.

**Rights policy (owner decision, 2026-08-06):** the pack ships **AI-generated French**
glosses tagged `source: 'MaxiRicci7000'`, not Hucker's English. Treated as
redistributable; `metadata.englishFromHucker` keeps provenance for audit. This is
a deliberate risk call (distinct from the English collision-archive rule). Harvard
hosting a scan of Hucker is noted as context, not a formal license grant.

**Grognard wiring:** pack id `maxiricci7000-translations` fills `metadata.translationFr`
on CBDB/Norbert office candidates (by `officeIds`, with zh/dynasty fallback) and
mints `entity_translations` with `language: 'fr'`. English Huckbot glosses are
unchanged.

## Prerequisites

```bash
# Hucker OCR + CBDB sqlite (same as Huckbot)
# OPENAI_API_KEY in the shell
npm run reconcile:norbert-offices   # if you also want fresh Huckbot includes later
```

## Workflow

```bash
# 1. Collect Batch A/B targets + Rotours seeds
npm run collect:maxiricci7000
# Optional: fold unfinished Huckbot candidates into Batch B
npm run collect:maxiricci7000 -- --include-candidates

# 2. Batch A (Hucker full entries) — preview then pilot then full
OPENAI_API_KEY=... npm run generate:maxiricci7000:a -- --dry-run
OPENAI_API_KEY=... npm run generate:maxiricci7000:a -- --sample 50
OPENAI_API_KEY=... npm run generate:maxiricci7000:a -- --resume

# 3. Batch B (gaps, retrieves against A) — only after A has French rows
OPENAI_API_KEY=... npm run generate:maxiricci7000:b -- --dry-run
OPENAI_API_KEY=... npm run generate:maxiricci7000:b -- --sample 50
OPENAI_API_KEY=... npm run generate:maxiricci7000:b -- --resume

# 4. Compile pack
npm run compile:maxiricci7000
```

Outputs under `packs/maxiricci7000/` (gitignored):

- `rotours-seeds.ndjson` — ~750 `RR:` French snippets from Hucker
- `batch-a-targets.ndjson` / `batch-b-targets.ndjson`
- `candidates-a.ndjson` / `candidates-b.ndjson`
- `french-lexicon.ndjson` — mined during Batch B
- `translations.ndjson` + `translations-manifest.json`

Compile drops junk (numeric English like `8947`, CJK parked in the English
field, French that still contains Chinese characters). Rejected rows land in
`reports/maxiricci7000-rejected.ndjson`.

Expect ~1 call/s; Batch A is thousands of rows (hours). Use `--resume` after interruptions.

## Why this is better than flat EN→FR

1. Full Hucker definitions disambiguate rank, agency, and unofficial uses.
2. Rotours citations already inside Hucker give a Francophone scholarly register.
3. Batch B does not invent a style — it imitates Batch A via retrieval + lexicon
   (same architecture that lifted English Huckbot over the rule-based floor).

## Files

- `lib.mjs` — RR extraction, French lexicon/retrieval, prompts, OpenAI client
- `collectTargets.mjs` — Batch A/B + seeds
- `generateBatchA.mjs` / `generateBatchB.mjs`
- `compileTranslations.mjs`
- `lib.test.mjs`

## Optional later

- Two-pass refine (draft → self-critique against zh+en)
- Spot adequacy rating (100–200 rows) before trusting the pack
- Human review pass on a sample before cutting a public release
