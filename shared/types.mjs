/**
 * Mirrors leaf-writer `AuthorityCandidate` plus compile-time extensions.
 * @typedef {'person' | 'place' | 'org' | 'work' | 'office'} EntityKind
 */

/**
 * @typedef {Object} GeoPoint
 * @property {number} lat
 * @property {number} lon
 */

/**
 * @typedef {Object} CandidateMetadata
 * @property {string} [dynasty]
 * @property {number} [startYear]
 * @property {number} [endYear]
 * @property {string} [subtype]
 * @property {string} [description]
 * @property {string} [teiTag]
 * @property {string} [ana]
 * @property {{ cbdb?: string, chgis?: string, dila?: string, wikidata?: string[], viaf?: string, ndl?: string, bdrc?: string }} [crosswalk]
 * @property {string} [pinyin]
 * @property {string} [yomi]
 * @property {string} [yomiHiragana]
 * @property {string} [translation]
 * @property {string} [nameFt]
 * @property {string} [nameCh]
 * @property {GeoPoint} [geo]
 * @property {string} [layer]
 */

/**
 * @typedef {Object} NameEntry
 * @property {string} text
 * @property {string} [type] LJB canonical name-type id (see leaf-writer
 *   `autoTagging/nameTypes.ts`: primary/courtesy/art/posthumous/temple/
 *   dharma/pen/variant) or a source-specific label leaf-writer's
 *   `normalizeNameType` understands (Wikidata P-ids, CJK category labels).
 *   Absent/unrecognized → ingested as `variant`.
 * @property {string} [lang]
 */

/**
 * @typedef {Object} AuthorityCandidate
 * @property {string} source
 * @property {string} authorityId
 * @property {EntityKind} kind
 * @property {string} primaryName
 * @property {string[]} searchStrings
 * @property {NameEntry[]} [names] Typed names, when the source preserves name
 *   categories (currently CBDB only — see `cbdb/constants.mjs`
 *   `CBDB_NAME_TYPE_MAP`; DILA's TEI export has no structured name-type
 *   attribute so its persName/placeName stay untyped). Absent on packs built
 *   before this field existed; leaf-writer treats that as "no typed names".
 * @property {CandidateMetadata} [metadata]
 */

export {};
