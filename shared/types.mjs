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
 * @property {'fine'|'nationality'} [dateSource]
 * @property {{ id: string, canonicalId: string, label: string, sourceIds?: string[], startYear?: number, endYear?: number }[]} [nationality]
 * @property {OriginAssertion[]} [origin]
 * @property {number} [startYear]
 * @property {number} [endYear]
 * @property {string} [subtype]
 * @property {string} [description]
 * @property {string} [teiTag]
 * @property {string} [ana]
 * @property {{ cbdb?: string, chgis?: string, dila?: string, wikidata?: string[], norbert?: string, viaf?: string, ndl?: string, bdrc?: string }} [crosswalk]
 * @property {string} [pinyin]
 * @property {string} [yomi]
 * @property {string} [yomiHiragana]
 * @property {string} [translation]
 * @property {string} [alternateTranslation]
 * @property {string} [alternatePinyin]
 * @property {string} [nameFt]
 * @property {string} [nameCh]
 * @property {GeoPoint} [geo]
 * @property {string} [layer]
 * @property {boolean} [geoAdminSuffix] Office typically follows a placeName (令, 太守, …).
 * @property {string} [placeCat] Place category when geo-admin suffix wraps a place (縣/郡/州).
 * @property {boolean} [followsPlace]
 * @property {boolean} [followsOffice]
 * @property {boolean} [followsPerson]
 * @property {boolean} [isNobleTitle]
 * @property {boolean} [isCollective]
 * @property {boolean} [isReligious]
 * @property {boolean} [isMilitary]
 * @property {boolean} [isMeritTitle]
 * @property {boolean} [isPrestigeTitle]
 * @property {boolean} [isQualifier]
 * @property {boolean} [isSite]
 * @property {string} [parentString]
 * @property {boolean} [parentIsSite]
 * @property {{ source: string, authorityId: string, entityId: string, name: string }} [parentOffice]
 * @property {string} [prefix]
 * @property {string} [core]
 * @property {string} [category]
 * @property {boolean} [categoryIsSuffix]
 * @property {boolean} [yieldPrefix]
 * @property {string} [entityId] Stable source-scoped office entity id.
 * @property {string} [canonicalEntityId] Canonical entity id after concordance,
 *   including CBDB's internal person merge table.
 * @property {string[]} [officeTypeIds] CBDB office classification node ids.
 * @property {string} [sourceRef]
 * @property {string} [sourcePages]
 * @property {string} [note]
 * @property {{ dynasty?: string, fief?: string, familyName?: string, roleName?: string, posthumousName?: string, posthumousNameAbbr?: string }[]} [nobleTitles]
 * @property {AppointmentRecord[]} [appointments] Person appointment assertions
 *   retained for disambiguation and entity import. Deliberately omits dates
 *   and biographical order for now.
 */

/**
 * A source-preserving assertion that a person is associated with a place of
 * origin. The place may be identified only by a string, or additionally by a
 * source authority ID and coordinates.
 * @typedef {Object} OriginAssertion
 * @property {string} source
 * @property {string} originType
 * @property {string} placeName
 * @property {string} [placeAuthorityId]
 * @property {string} [sourceCategory]
 * @property {string} [placeType]
 * @property {string} [qualification]
 * @property {string} [sourceRef]
 * @property {string} [note]
 * @property {GeoPoint} [geo]
 */

/**
 * @typedef {Object} AppointmentRecord
 * @property {string} source
 * @property {string} authorityId Stable source row or derived assertion id.
 * @property {{ source: string, authorityId: string }} person
 * @property {{ source: string, authorityId?: string, name: string }} office
 * @property {string} [appointmentType]
 * @property {string} [sourceRef]
 */

/**
 * @typedef {Object} NameEntry
 * @property {string} text
 * @property {string} [type] LJB canonical name-type id (see leaf-writer
 *   `autoTagging/nameTypes.ts`: primary/courtesy/art/posthumous/temple/
 *   dharma/pen/variant/family/given/birth) or a source-specific label
 *   leaf-writer's `normalizeNameType` understands (Wikidata P-ids, CJK
 *   category labels). Absent/unrecognized → ingested as `variant`. For CBDB,
 *   `names[]` is a superset of `searchStrings` (bare 姓/名/字 and other
 *   phase-2-only forms appear only in `names[]`).
 * @property {string} [lang]
 */

/**
 * @typedef {Object} AuthorityCandidate
 * @property {string} source
 * @property {string} authorityId
 * @property {EntityKind} kind
 * @property {string} primaryName Stable authority headword / database title.
 * @property {string} [displayName] Surface shown when LJB creates or labels an
 * entity. Sources without a distinction use `primaryName` as the fallback.
 * @property {string[]} searchStrings
 * @property {NameEntry[]} [names] Typed names, when the source preserves name
 *   categories (currently CBDB only — see `cbdb/constants.mjs`
 *   `CBDB_NAME_TYPE_MAP`; DILA's TEI export has no structured name-type
 *   attribute so its persName/placeName stay untyped). Absent on packs built
 *   before this field existed; leaf-writer treats that as "no typed names".
 * @property {CandidateMetadata} [metadata]
 */

export {};
