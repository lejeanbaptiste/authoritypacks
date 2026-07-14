# Wikidata Output Contract

This document defines the boundary between the Wikidata extraction pipeline and
its three consumers: LJB tag packs, the Japanese IME data, and `entities.xml`.

## Three outputs

### LJB tag packs

Tag packs contain strings that are safe to use for tagging, together with the
metadata needed for date and period filtering.

Required data:

- the primary surface form;
- conservative, independently recorded alternative full names;
- the Wikidata QID as the source entity key;
- entity kind;
- start and end years where applicable;
- dynasty or historical-period membership where available.

Japanese kana is not tag-pack search data. It stays in raw extraction data for
the IME output.

The person-name policy is intentionally conservative. Include a primary full
name, a full independently recorded alias, a complete `xing + ming` name, or an
independent religious, dharma, posthumous, or regnal name. Do not synthesize
every possible combination of `xing`, `ming`, `zi`, and title. In particular,
bare surnames, bare courtesy names, style names, birth-order names, and office
titles should not become LJB search strings. A future Norbert-style name
generator may use the raw components, but it should not silently change the LJB
tagging policy.

### IME data

IME data should be emitted as a separate table, ideally one row per surface and
reading. For Japanese entities it contains:

- Wikidata QID;
- Japanese surface form;
- kana reading(s);
- normalized hiragana reading;
- optional birth/death or other dates for disambiguation.

Kana must not be copied into compiled tagging packs merely because it was useful
to the IME. The current raw person rows retain `nameInKana` and
`yomiHiragana`; a later CSV writer can turn those fields into the IME table.

The `entities.xml` enrichment code belongs to LJB, not this repository. This
repository stops at tag-pack and IME inputs. Authority IDs, URLs, descriptions,
and Romanized forms should be added by the LJB-side enrichment step.

## Raw extraction fields

The raw NDJSON layer is the shared source for all three outputs. Common fields
are:

| Field | Meaning |
| --- | --- |
| `qid` | Wikidata source entity key, such as `Q180903` |
| `primaryLabel` | Selected pack-language surface form |
| `aliases` | Aliases in the selected pack language, including `P1705` when distinct |
| `p31` | Wikidata instance-of IDs |

Person rows additionally contain `familyName`, `givenName`, `p27`, `p2348`,
`birthYear`, and `deathYear`. Japanese rows may additionally contain
`nameInKana` and `yomiHiragana`.

Other kinds retain their existing date fields:

- works: `publicationYear`;
- organizations: `inceptionYear` and `dissolvedYear`;
- places: authority and place identifiers where available.

For filtering, a year is currently the normalized representation. Future work
should preserve date precision and uncertainty where the dump provides it, so
that an exact year is not confused with an approximate or inferred year.

## Languages

The configured language slices are `zh-hant`, `zh-hans`, `lzh`, `ja`, `ko`,
`en`, `bo`, and `vi`. Each slice chooses its native label language first and
may fall back according to `wikidata/languages.json`.

Romanization is outside this repository's extraction contract. It belongs in
the LJB-side `entities.xml` enrichment workflow.

## Ambiguity and provenance

Several surfaces may refer to one entity, and one surface may refer to several
entities. Downstream reports and disambiguation should therefore be able to
join by QID and count candidate entities rather than treating a surface as a
unique identity.

The extraction layer should preserve enough provenance to reproduce a result:
the dump path, extraction language, membership selection, QID, and source
fields. Descriptions and labels are display data and may change between dump
versions; they should not be used as stable identifiers.

## Commands

The existing commands remain the entry points:

- `npm run wikidata:extract` for person or custom extraction;
- `npm run wikidata:extract-ja` for Japanese person rows with IME readings;
- `npm run wikidata:extract-works-zh` for Chinese works;
- `npm run wikidata:extract-zh-ja-orgs-works` for Chinese/Japanese organizations and works;
- `npm run wikidata:compile` and the kind-specific compile commands for tag packs.

The raw NDJSON files are the authoritative intermediate output. Use
`npm run wikidata:export-ime -- --raw PATH --out PATH` to write a separate
Japanese `ime.csv`. The exporter consumes raw rows rather than changing the
tag-pack compiler's search-string policy.
