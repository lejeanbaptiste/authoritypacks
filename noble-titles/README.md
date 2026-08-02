# Noble-title filter

Authority sources regularly put a sovereign, princely, or posthumous title in
`persName`/`roleName` fields.  That makes the title look like an identity name
and causes it to be imported and tagged incorrectly.  This directory is the
reviewed boundary between source data and LJB's structural noble-title model.

## Review workflow

1. Run `npm run audit:noble-titles` from `authority extraction` after compiling
   or staging packs.  It writes `reports/noble-title-authority-review.csv`.
2. Review the rows.  The detector is intentionally generous; a row in the CSV
   is **not** a decision.
3. For each safe decision, add a record to `approved-include.ndjson` (one JSON
   object per line).  A decision must name an exact surface and complete enough
   components to generate legal TEI.
4. Run the audit again, then build packs.  The build removes the approved
   surface from person/office name matching and emits a title candidate instead.

The include is an allow-list, never a regular-expression blacklist.  Do not
approve bare ranks such as `王`, `后`, or `帝`; they remain legitimate role
names in many contexts.

## Include record

```json
{
  "id": "stable-curation-id",
  "surface": "海鹽公主",
  "action": "nobleTitle",
  "components": { "fief": "海鹽", "roleName": "公主" },
  "sources": ["NORBERT"],
  "note": "Optional human rationale"
}
```

`action` is either:

- `nobleTitle`: the entire surface is a title; it becomes a structured
  `<nobleTitle>` suggestion and is not retained as a `persName` or `roleName`.
- `personWrapper`: the surface contains a title followed by the indicated
  `personName`; it becomes `<name type="personWrapper">` containing the
  structured title and `<persName>`.

`components.roleName` is required.  `fief`, `posthumousName`,
`posthumousNameAbbr`, `dynasty`, and `personName` are optional.  For a wrapper,
`personName` is required. `sources`, when present, is an exact uppercase source
allow-list (for example `"NORBERT"`).
The final source name is deliberately strict so an approval for one authority
cannot silently affect another.

## Guarantees

- An empty or malformed include has no filtering effect.
- Approved source surfaces are retained in the audit trail and represented by
  a derived noble-title candidate, not discarded.
- The runtime never mints an entity for a derived noble-title candidate.
- Group & Clean only reparses existing `persName`/`roleName` text when it has
  an exact approved decision; unapproved title-shaped text remains unchanged.
