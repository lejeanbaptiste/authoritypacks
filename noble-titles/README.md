# Noble-title filter

Authority sources regularly put a sovereign, princely, or posthumous title in
`persName`/`roleName` fields.  That makes the title look like an identity name
and causes it to be imported and tagged incorrectly.  This directory is the
reviewed boundary between source data and Grognard's structural noble-title model.

## Review workflow

1. Run `npm run audit:noble-titles` from `authority extraction` after compiling
   or staging packs.  It writes the review table at
   `reports/noble-title-authority-review.csv`.
2. Review the rows.  `status` is the decision (`accepted`, `deferred`, or
   `rejected`); `suggestedAction` records the accepted structural interpretation.
3. For accepted rows, the compiler converts the table into
   `approved-include.ndjson` (one exact source/surface rule per row). Deferred
   and rejected rows are retained in the CSV but never enter the filter.
4. Build packs. The build removes accepted surfaces from person/office name
   matching and emits a title candidate instead.

The current validated table records three explicit policy decisions:

- accepted wrapper-shaped rows with no actual trailing person name are changed
  to `nobleTitle`;
- accepted rows whose action names a trailing given/full name are normalized to
  `personWrapper`, since the person name must remain outside the title;
- simple role-only titles use `nobleTitle, role-only`, with the complete surface
  retained as the role component (for example `太子`, `皇后`, or `公主`);
- `special` and `husbandPN` parses are `deferred` until their components can be
  modeled without guessing.

The table is the review authority; this README documents how its decisions are
compiled, rather than duplicating the decision list.

The current release compiles 2,500 source-scoped accepted rules (1,773 distinct
surfaces) into `dist/authority-packs/noble-title-filter/`. The bundle contains
`noble-titles.ndjson` for runtime replacement, `approved-include.ndjson` for
provenance/rebuilds, and a manifest describing the exact-match policy.

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
