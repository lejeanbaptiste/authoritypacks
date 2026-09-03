# BDRC authority data: Wylie conversion

This directory is private research material supplied by BDRC. The files in it
must not be published, uploaded, or shared. They are intended only for the two
researchers named in the project context.

## What we learned

The source tables contain BDRC person and place authorities with columns `p`,
`n`, and `nt`. The `n` values are predominantly Wylie/Extended Wylie, but the
field also contains punctuation, uncertainty markers, numbers, and a small
amount of already-present Tibetan script.

The working interpretation of the symbols is:

- `+`: Extended Wylie for unusual Tibetan/Sanskrit stacks.
- `/`: Tibetan shad punctuation; it is usually terminal in these data.
- `'`: Wylie `a chung` (འ), not ordinary English punctuation.
- `.`: Extended-Wylie non-joiner in forms such as `g.ya`.
- `*`: uncertain or editorial marker; removed before conversion as requested.
- `?`: unexplained/uncertain marker.
- Parentheses and brackets: cataloguing or editorial material to exclude.

Wylie is intended to represent Tibetan spelling rather than pronunciation. A
strict converter can therefore reconstruct script for valid Wylie, but not for
phonetic renderings or unresolved editorial material. Conversion now uses the
local `pyewts` implementation of Extended Wylie, derived from BDRC's Java
converter, with its warnings collected during the run.

## Decisions for this asset pack

The generated tables retain the `p` and `nt` values, clean the displayed `n`
value as specified below, and add a `bo` column. The untouched source tables
remain the provenance copy.

- Rows containing `?`, `(`, `)`, `[`, or `]` are excluded.
- Asterisks are removed from the cleaned `n` value and conversion input.
- Digits are removed from the conversion input; they are not converted to
  Tibetan numerals. This is chiefly relevant to numbered title/succession
  entries and to identifiers/qualifiers.
- Rows containing embedded Tibetan script are retained with blank `bo` for
  manual review.
- A blank `bo` means that the value was excluded from automatic conversion or
  could not be parsed conservatively; it is not evidence that the name lacks a
  Tibetan spelling.

## Outputs

- `cleaned-bdrc-personNames.csv`
- `cleaned-bdrc-placeNames.csv`

Both outputs remain under this ignored directory. The conversion program is
`convert-bdrc-pyewts.py`; it uses only local files and the vendored `pyewts`
source in `pyewts_vendor/`. The run produced 532 converter warnings across the
two tables; these are retained as a signal for manual review rather than
silently corrected.

## Compile to one internal LJB plugin pack

After the cleaned CSVs exist:

```bash
npm run compile:bdrc
```

Writes a **single gitignored folder** at `packs/bdrc/`:

| File | Role |
|------|------|
| `plugin.manifest.json` | LJB plugin (Tools → Plugins → Install from folder) |
| `persons.ndjson` | Person tagging strings |
| `places.ndjson` | Place tagging strings |
| `manifest.json` | Counts, license, do-not-redistribute policy |
| `dist/register.mjs` | Stub plugin entry |

LJB still uses two pack ids internally (`bdrc-persons-bo`, `bdrc-places-bo`) because persons and places tag different TEI elements, but they ship as **one** plugin.

**Tagging policy:** Tibetan script (`bo`) only in `searchStrings`. Wylie is kept
in typed `names[]` as `romanization` (`bo-x-ewts`). Person titles
(`PersonTitle`, `PersonTulkuTitle`, …) are retained for entity intake but
excluded from auto-tagging seeds.

**Install in LJB:** Tools → Plugins → **Install from folder…** and choose
`packs/bdrc` (the folder that contains `plugin.manifest.json`, not a
subfolder). Then enable **BDRC authority (internal)** for the project.
These files must **never** ship in public `authority-packs-tibetan` releases
or CI.
