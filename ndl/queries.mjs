import { NDL_PREFIXES, NDL_SPARQL_PAGE_SIZE } from './constants.mjs';

const { foaf, xl, ndl, rda } = NDL_PREFIXES;

function prefixLines() {
  return [
    `PREFIX foaf: <${foaf}>`,
    `PREFIX xl: <${xl}>`,
    `PREFIX ndl: <${ndl}>`,
    `PREFIX rda: <${rda}>`,
  ].join('\n');
}

/** @returns {string} */
export function personCountQuery() {
  return `${prefixLines()}
SELECT (COUNT(?entity) AS ?count) WHERE {
  ?entity a foaf:Person .
}`;
}

/**
 * Paginated person harvest — keyset paging on ?auth URI.
 *
 * NDL SPARQL rejects OFFSET when OFFSET + LIMIT > 10_000, so OFFSET cannot
 * walk the full ~1M person set. Pass `afterAuth` (full ndlna URI from the
 * previous page's last row) instead.
 *
 * @param {{ afterAuth?: string, limit?: number }} opts
 */
export function personPageQuery(opts = {}) {
  const limit = opts.limit ?? NDL_SPARQL_PAGE_SIZE;
  const cursorFilter = opts.afterAuth ? `FILTER (?auth > <${opts.afterAuth}>)` : '';
  return `${prefixLines()}
SELECT ?auth ?name ?heading ?yomi ?yomiAlt ?birth ?death WHERE {
  ?auth foaf:primaryTopic ?entity .
  ?entity a foaf:Person .
  ?entity foaf:name ?name .
  OPTIONAL {
    ?auth xl:prefLabel ?pl .
    ?pl xl:literalForm ?heading .
    OPTIONAL { ?pl ndl:transcription ?yomi . FILTER (lang(?yomi) = "ja-kana") }
  }
  OPTIONAL {
    ?auth xl:altLabel ?al .
    ?al ndl:transcription ?yomiAlt .
    FILTER (lang(?yomiAlt) = "ja-kana")
  }
  OPTIONAL { ?entity rda:dateOfBirth ?birth . }
  OPTIONAL { ?entity rda:dateOfDeath ?death . }
  ${cursorFilter}
}
ORDER BY ?auth
LIMIT ${limit}`;
}

/**
 * Sample persons whose foaf:name matches a prefix (for spot checks).
 * @param {{ namePrefix: string, limit?: number }} opts
 */
export function personSampleByPrefixQuery(opts) {
  const limit = opts.limit ?? 20;
  const escaped = opts.namePrefix.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `${prefixLines()}
SELECT ?auth ?name ?heading ?yomi ?yomiAlt ?birth ?death WHERE {
  ?auth foaf:primaryTopic ?entity .
  ?entity a foaf:Person .
  ?entity foaf:name ?name .
  OPTIONAL {
    ?auth xl:prefLabel ?pl .
    ?pl xl:literalForm ?heading .
    OPTIONAL { ?pl ndl:transcription ?yomi . FILTER (lang(?yomi) = "ja-kana") }
  }
  OPTIONAL {
    ?auth xl:altLabel ?al .
    ?al ndl:transcription ?yomiAlt .
    FILTER (lang(?yomiAlt) = "ja-kana")
  }
  OPTIONAL { ?entity rda:dateOfBirth ?birth . }
  OPTIONAL { ?entity rda:dateOfDeath ?death . }
  FILTER regex(?name, "^${escaped}")
}
ORDER BY ?name
LIMIT ${limit}`;
}

const placePrefixLines = () =>
  [
    ...prefixLines().split('\n'),
    'PREFIX skos: <http://www.w3.org/2004/02/skos/core#>',
    'PREFIX ndlaScheme: <http://id.ndl.go.jp/auth#>',
    'PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>',
  ].join('\n');

/** Geographic name authorities; excludes subject subdivisions containing `--`. */
export function placeCountQuery() {
  return `${placePrefixLines()}
SELECT (COUNT(?auth) AS ?count) WHERE {
  ?auth skos:inScheme ndlaScheme:geographicNames .
  ?auth rdfs:label ?label .
  FILTER (!regex(?label, "--"))
}`;
}

/**
 * @param {{ afterAuth?: string, limit?: number }} opts
 */
export function placePageQuery(opts = {}) {
  const limit = opts.limit ?? NDL_SPARQL_PAGE_SIZE;
  const cursorFilter = opts.afterAuth ? `FILTER (?auth > <${opts.afterAuth}>)` : '';
  return `${placePrefixLines()}
SELECT ?auth ?name ?heading ?yomi ?yomiAlt WHERE {
  ?auth skos:inScheme ndlaScheme:geographicNames .
  ?auth rdfs:label ?name .
  FILTER (!regex(?name, "--"))
  OPTIONAL {
    ?auth xl:prefLabel ?pl .
    ?pl xl:literalForm ?heading .
    OPTIONAL { ?pl ndl:transcription ?yomi . FILTER (lang(?yomi) = "ja-kana") }
  }
  OPTIONAL {
    ?auth xl:altLabel ?al .
    ?al ndl:transcription ?yomiAlt .
    FILTER (lang(?yomiAlt) = "ja-kana")
  }
  ${cursorFilter}
}
ORDER BY ?auth
LIMIT ${limit}`;
}

/**
 * @param {{ namePrefix: string, limit?: number }} opts
 */
export function placeSampleByPrefixQuery(opts) {
  const limit = opts.limit ?? 20;
  const escaped = opts.namePrefix.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `${placePrefixLines()}
SELECT ?auth ?name ?heading ?yomi ?yomiAlt WHERE {
  ?auth skos:inScheme ndlaScheme:geographicNames .
  ?auth rdfs:label ?name .
  FILTER (!regex(?name, "--"))
  OPTIONAL {
    ?auth xl:prefLabel ?pl .
    ?pl xl:literalForm ?heading .
    OPTIONAL { ?pl ndl:transcription ?yomi . FILTER (lang(?yomi) = "ja-kana") }
  }
  OPTIONAL {
    ?auth xl:altLabel ?al .
    ?al ndl:transcription ?yomiAlt .
    FILTER (lang(?yomiAlt) = "ja-kana")
  }
  FILTER regex(?name, "^${escaped}")
}
ORDER BY ?name
LIMIT ${limit}`;
}

/** Corporate body authorities; excludes subject subdivisions containing `--`. */
export function orgCountQuery() {
  return `${placePrefixLines()}
SELECT (COUNT(?auth) AS ?count) WHERE {
  ?auth skos:inScheme ndlaScheme:corporateNames .
  ?auth rdfs:label ?label .
  FILTER (!regex(?label, "--"))
}`;
}

/**
 * @param {{ afterAuth?: string, limit?: number }} opts
 */
export function orgPageQuery(opts = {}) {
  const limit = opts.limit ?? NDL_SPARQL_PAGE_SIZE;
  const cursorFilter = opts.afterAuth ? `FILTER (?auth > <${opts.afterAuth}>)` : '';
  return `${placePrefixLines()}
SELECT ?auth ?name ?heading ?yomi ?yomiAlt WHERE {
  ?auth skos:inScheme ndlaScheme:corporateNames .
  ?auth rdfs:label ?name .
  FILTER (!regex(?name, "--"))
  OPTIONAL {
    ?auth xl:prefLabel ?pl .
    ?pl xl:literalForm ?heading .
    OPTIONAL { ?pl ndl:transcription ?yomi . FILTER (lang(?yomi) = "ja-kana") }
  }
  OPTIONAL {
    ?auth xl:altLabel ?al .
    ?al ndl:transcription ?yomiAlt .
    FILTER (lang(?yomiAlt) = "ja-kana")
  }
  ${cursorFilter}
}
ORDER BY ?auth
LIMIT ${limit}`;
}

/**
 * @param {{ namePrefix: string, limit?: number }} opts
 */
export function orgSampleByPrefixQuery(opts) {
  const limit = opts.limit ?? 20;
  const escaped = opts.namePrefix.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `${placePrefixLines()}
SELECT ?auth ?name ?heading ?yomi ?yomiAlt WHERE {
  ?auth skos:inScheme ndlaScheme:corporateNames .
  ?auth rdfs:label ?name .
  FILTER (!regex(?name, "--"))
  OPTIONAL {
    ?auth xl:prefLabel ?pl .
    ?pl xl:literalForm ?heading .
    OPTIONAL { ?pl ndl:transcription ?yomi . FILTER (lang(?yomi) = "ja-kana") }
  }
  OPTIONAL {
    ?auth xl:altLabel ?al .
    ?al ndl:transcription ?yomiAlt .
    FILTER (lang(?yomiAlt) = "ja-kana")
  }
  FILTER regex(?name, "^${escaped}")
}
ORDER BY ?name
LIMIT ${limit}`;
}
