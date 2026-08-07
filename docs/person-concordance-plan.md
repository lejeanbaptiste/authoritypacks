# Person concordance plan (Norbert ↔ CBDB / DILA / Wikidata)

Planning note for replacing the current single-rule Norbert person concordance
(`primary + 字 + dynasty`, unique only) with a **tiered, multi-factor** linker.
This revises the earlier diagnosis with three Norbert-specific constraints:

1. People may have **multiple dynasties**; every dynasty must be tried.
2. Norbert’s useful chronological range is roughly **through the Tang**, so a
   second eligibility set (typed 姓 + 名 + 字, **no** dynasty) may be matched
   only against **pre-Tang** CBDB / Wikidata records.
3. **Emperors and empresses** should be selected from noble-title rows, then
   matched on ruler-specific keys (not 字).

Status: **implemented and review-merged** (2026-08-04).

- Tiered matcher: `norbert/concordance.mjs` (`npm run concordance:persons`).
- Review CSV: `reports/norbert-person-concordance-review.csv` (**tracked in
  git**; `build:packs` fails if missing).
- Accepted Tier 0 / 1A–1C plus reviewed Tier 2 `link` rows are merged at pack
  build time (~4.7k concordance rows). Apply pack crosswalks with
  `npm run concordance:merge-review` then `npm run concordance:integrate`,
  or just run `npm run build:packs`.
- Remaining concordance work (optional polish, purge-order UI, release) is
  tracked in [`docs/extraction-todo.md`](./extraction-todo.md).

---

## Problem summary

The current linker in `norbert/concordance.mjs` is intentionally strict and
therefore low-recall:

| Observation | Approximate figure |
|-------------|--------------------|
| Norbert persons | ~16,570 |
| Eligible under `primary + 字 + dynasty` | ~22.8% |
| Unique Norbert ↔ CBDB links today | ~359 (~2%) |
| DILA persons with structured 字 | 0 (never enter the rule) |
| DILA rows that already carry CBDB / Wikidata idnos | ~1.8k / ~2k |
| Wikidata ↔ CBDB identifier pairs already extracted | ~416k |

Famous people often fail for **data-shape** reasons, not absence. Example:

- Norbert `李世民` (唐, no 字)
- CBDB `李世民(唐太宗)` (唐, temple `太宗`, no 字)
- DILA already links both CBDB and Wikidata

Compile today also **collapses** Norbert’s multi-dynasty evidence to a single
`metadata.dynasty` (first / majority court), even though `person_dynasties` and
`nat_raw.court_id` can contribute several dynasties per person. Concordance
must not inherit that loss.

---

## Design principles

1. **Precision by default.** Auto-accept only unique, high-evidence links.
   Ambiguous candidates go to a review file, not into `metadata.crosswalk`.
2. **Several doors, not one.** Literati, undated pre-Tang people, and rulers
   use different keys.
3. **IDs beat strings.** Explicit crosswalks (DILA idnos, Wikidata P497 / P1187,
   VIAF, etc.) are Tier 0 and are never re-derived from names.
4. **All Norbert dynasties count.** A person matches if **any** of their
   dynasties is compatible with the candidate, not only the single label now
   stored on the pack row.
5. **Source-preserving evidence.** Every accepted row records which rule fired
   and which fields agreed (dynasty id/label, temple, 字, etc.).

---

## Prerequisite: richer Norbert dossiers

Before scoring, each Norbert person should expose a stable **dossier** (either
in the pack or built at concordance time from pack + `person_nt` wrappers):

| Field | Source | Notes |
|-------|--------|-------|
| `names[]` | `person_names` | Keep typed 姓 / 名 / 字 / 號 / 法號 / … |
| `dynasties[]` | `person_dynasties` ∪ `nat_raw.court_id` | **All** labels + ids + year bounds; do not drop extras |
| `metadata.dynasty` | derived | Optional single “preferred” label for UI/clues only |
| `nobleTitles[]` | `person_nt` | rank (`nt`), temple (`tn`), posthumous (`pn` / abbr), fief, dynasty |
| Name bag | typed names + searchStrings + stripped primaries | Include personal name after removing `(…)` and title wrappers |

**Compile change (recommended):** emit `metadata.dynasties` (array) and ensure
`metadata.nobleTitles` is present on person rows (lookup already shapes this;
the current tagging pack often lacks it, while `person-wrappers.ndjson`
retains components). Concordance may join wrappers by `personId` until pack
rows are refreshed.

**Dynasty compatibility:** map surface labels (唐 / 唐朝 / 唐代, 北宋 ⊂ 宋,
西漢 / 漢, …) to shared slugs before comparing. A Norbert person with
`[東晉, 劉宋]` may match a CBDB 劉宋 row or an 東晉 row; conflicting
non-overlapping dynasties score as a penalty, not an instant hard fail when
other ruler evidence is strong (review tier).

---

## Tier 0 — explicit identifier graph

Run first; no name matching required.

1. DILA `idno` → CBDB / Wikidata.
2. Wikidata dump / pack crosswalks → CBDB (`P497`), DILA (`P1187`), VIAF, …
3. Transitive closure onto Norbert once any Norbert ↔ CBDB (or ↔ Wikidata)
   link exists from a later tier.
4. Integrate bidirectional `metadata.crosswalk` as today
   (`integrateConcordance.mjs`).

This recovers curated “spine” identities (including many rulers) that string
rules miss.

---

## Tier 1A — literati key (keep, but dynasty-aware)

**Eligibility (Norbert):** has primary (or personal) name, has structured 字,
has **at least one** dynasty in `dynasties[]`.

**Match:** personal/primary name agrees **and** 字 agrees (existing suffix
rule for bare Wikidata P1782) **and** **any** Norbert dynasty is compatible
with the candidate’s dynasty.

**Accept:** unique candidate per target source; else review.

This is the current rule, fixed so multi-dynasty people are not forced through
a single collapsed label.

---

## Tier 1B — undated 姓+名+字 set → pre-Tang targets only

Norbert’s coverage is strongest through the Tang. People who have rich
personal-name typing but **no** dynasty should not be matched against the
whole of CBDB / Wikidata.

**Eligibility (Norbert):**

- typed **family (姓)** and **given (名)** and **字 (courtesy)** present;
- `dynasties[]` empty / no dynasty label.

**Target filter (CBDB / Wikidata only for this set):**

- record is **pre-Tang**: dynasty `endYear < 618`, or person
  death/floruit/end year `< 618` when dynasty years are missing (see settled
  decisions).

**Match:** family + given (+ 字 with suffix rule) against the filtered target
pool; dynasty is not required on the Norbert side.

**Accept:** unique hit only. If several pre-Tang homonyms share 姓名字, send
to review rather than guessing.

**Note:** in the current compiled pack, fully typed 姓+名+字 with no dynasty
is rare (name-type coverage is uneven; many courtesy names exist without a
separate typed 姓). Implementation should:

- count true eligibility after any surname-splitting improvements;
- optionally derive family/given from `can_name` + `surnames.json` **only**
  when typed fields are missing, and mark that derivation in evidence
  (`familySource: typed | split`).

---

## Tier 1C — emperors and empresses (noble-title subset)

Do **not** scan all Norbert people for ruler patterns. Narrow first.

### Selection

Use `person_nt` / `nobleTitles` / person-wrappers where **rank / roleName** is
an emperor or empress title. Observed ranks in current wrappers include at
least:

| Role group | Example ranks in `person_nt` |
|------------|------------------------------|
| Emperor | `帝`, `皇帝`, `天皇` |
| Empress / dowager | `后`, `皇后`, `太后` |
| Heir | `太子` (included; usually R2 / posthumous) |

Exclude consorts such as `妃`. Exact allowlist is settled below.

Optional extra gate: temple name (`tn`) and/or posthumous (`pn`) present, so
bare `帝` rows without commemorative names are not forced into auto-accept.

### Match keys (either is enough if unique)

**Key R1 — temple path**

- family name (typed 姓, or carefully split from personal name)
- dynasty compatible with **any** Norbert dynasty (from person dynasties
  **or** the noble-title row’s dynasty)
- temple name (`tn` / typed `temple` on CBDB / alias such as `太宗`)

**Key R2 — posthumous + role path**

- family name
- dynasty (as above)
- role ∈ {emperor, empress, …} on both sides when the target encodes it;
  otherwise require the Norbert role allowlist and a target that is clearly
  the same commemorative identity
- posthumous name (`pn` / CBDB `posthumous` / DILA–Wikidata aliases)

### Target-side normalization (especially CBDB)

- Split primaries like `李世民(唐太宗)` → personal `李世民` + temple/alias
  `唐太宗`.
- Treat CBDB typed `temple` / `posthumous` as first-class match fields.
- Wikidata labels often prefer temple/reign forms (`唐太宗`); use aliases and
  crosswalks rather than primary-label equality alone.

### Accept policy

- Unique R1 or R2 hit → auto-accept with `match: ruler-temple` or
  `ruler-posthumous`.
- Multiple hits → review queue with both keys’ feature flags.
- Do **not** require 字 for this tier (rulers often lack it).

---

## Tier 2 — scored fallback (optional next phase)

For people outside 1A–1C, a weighted score can propose candidates:

| Signal | Direction |
|--------|-----------|
| Shared personal name | strong positive |
| Shared 字 / 廟號 / 諡 / 法號 | strong positive |
| Any dynasty compatible | positive |
| Year-window overlap | positive |
| Shared origin / office | weak positive / tie-break |
| Conflicting dynasty or non-overlapping dates | strong negative |
| Very common surname + short given only | negative (demand more evidence) |

**No auto-accept for Tier 2 in the first implementation.** Write a review CSV
instead (see settled decision 5). Places and offices must not alone create
person identity (same policy as the origin audit).

---

## Tier 3 — review artifacts

Every non-accepted near-miss should land in something like
`reports/norbert-person-concordance-review.ndjson` with:

- Norbert id + candidate source/id
- tier / rule
- shared names, dynasties tried, temple/posthumous/字
- score or boolean feature vector
- reason not auto-accepted (`ambiguous`, `below-threshold`, `target-period-filter`)

This continues the spirit of the older Norbert CSVs
(`external_data/result_*_good.csv`) on the new pack pipeline.

---

## Evaluation

Build a small **gold set** (~100) before widening auto-accept:

- rulers / empresses with known CBDB or Wikidata ids (e.g. 李世民, 武曌/武則天,
  劉邦, …)
- literati with 字 (e.g. 李白)
- multi-dynasty people (confirm any-dynasty matching)
- Tier 1B examples (姓+名+字, no dynasty)

Report per tier:

- auto-accept count
- precision on gold
- recall on gold
- review-queue size

Success is **not** “link all 16k.” Success is high precision on Tiers 0–1,
strong recall on the ruler gold set, and a shrinking, explainable review
queue.

---

## Suggested implementation order

1. **Dossier / compile:** `metadata.dynasties[]`; ensure noble titles on person
   rows or a stable join from wrappers; dynasty slug map.
2. **Tier 0:** wire existing ID concordances + transitive Norbert links.
3. **Tier 1A:** dynasty-aware version of the current 字 rule.
4. **Tier 1C:** ruler allowlist + R1/R2 keys (highest visible win for emperors /
   empresses).
5. **Tier 1B:** undated 姓+名+字 → pre-Tang target filter; document the cutoff
   list.
6. **CBDB/Wikidata name normalization** used by all tiers (parentheses, temple
   aliases).
7. **Review export + gold metrics.**
8. **Tier 2** scoring only after 1A–1C precision is measured.

---

## Out of scope (for this plan)

- Inferring person identity from shared place labels alone.
- Auto-merging DILA ↔ CBDB on shared strings without idnos or the tiers above.
- Replacing LJB runtime disambiguation UI; this plan is about **pack-time**
  concordance rows that feed `metadata.crosswalk`.

---

## Related code and docs

| Path | Role |
|------|------|
| `norbert/concordance.mjs` | Current strict triple matcher |
| `norbert/integrateConcordance.mjs` | Writes crosswalks into packs |
| `norbert/compileRecords.mjs` | Collapses dynasty; builds `nobleTitles` |
| `norbert/personWrappers.mjs` | `person_nt` components (rank, temple, posthumous) |
| `packs/wikidata/cbdb-wikidata-concordance.ndjson` | Tier 0 CBDB ↔ QID |
| `docs/extraction-todo.md` | Operational checklist |
| Norbert repo `dila_person_matcher.py` | Older looser name+dynasty experiments |

---

## Settled decisions (👤 2026-08-04)

1. **Pre-Tang cutoff (Tier 1B targets):** include every dynasty whose date
   range **predates the Tang**. Operational rule:
   - Tang start = **618** (same as `shared/dynastyMap.mjs`).
   - A target dynasty counts as pre-Tang when it starts before 618 and ends
     at or before 618 (so **隋** 581–618 is included; **唐** 618–907 is not).
   - If a record has no dynasty label but has death/floruit/end year, treat
     it as pre-Tang when that year is `< 618`.
   - Labels with missing years stay out of the auto pool unless mapped via
     the dynasty table; do not guess.

2. **Ruler rank allowlist (Tier 1C):** include `帝`, `皇帝`, `天皇`, `后`,
   `皇后`, `太后`, and **`太子`**. Exclude **`妃`** (and other consorts not
   listed). `太子` rows usually have posthumous names but not temple names, so
   they will mostly use key R2 (family + dynasty + role + posthumous), with
   unique-only auto-accept.

3. **Derive 姓 from `surnames.json`:** **yes**, when typed family is missing
   (especially Tier 1B / 1C). Record `familySource: typed | split` on evidence
   rows so review can spot split errors.

4. **Preferred dynasty on pack rows:** keep single `metadata.dynasty` for
   clues / UI; concordance matching uses full `dynasties[]`.

5. **Tier 2:** **no auto-accept threshold** for now. Emit a
   **human-friendly CSV** for manual review (DPM), with enough columns to
   judge quickly (Norbert id/name, candidate source/id/name, shared names,
   dynasties tried, temple/posthumous/字, rule/tier, why it was not
   auto-accepted). Accepted Tier 0 / 1A–1C links still write concordance
   NDJSON + crosswalks as planned.
