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
 * @property {{ cbdb?: string, chgis?: string, dila?: string, wikidata?: string[] }} [crosswalk]
 * @property {string} [pinyin]
 * @property {string} [translation]
 * @property {string} [nameFt]
 * @property {string} [nameCh]
 * @property {GeoPoint} [geo]
 * @property {string} [layer]
 */

/**
 * @typedef {Object} AuthorityCandidate
 * @property {string} source
 * @property {string} authorityId
 * @property {EntityKind} kind
 * @property {string} primaryName
 * @property {string[]} searchStrings
 * @property {CandidateMetadata} [metadata]
 */

export {};
