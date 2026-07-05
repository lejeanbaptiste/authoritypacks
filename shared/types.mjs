/**
 * Mirrors leaf-writer `AuthorityCandidate` plus compile-time extensions.
 * @typedef {'person' | 'place' | 'org' | 'work' | 'office'} EntityKind
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
 * @property {{ cbdb?: string, wikidata?: string[] }} [crosswalk]
 * @property {string} [pinyin]
 * @property {string} [translation]
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
