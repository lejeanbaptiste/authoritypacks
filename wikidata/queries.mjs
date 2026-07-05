/**
 * SPARQL query builders for Wikidata pack prototypes (W1).
 * Production packs use dump extract (W2); these queries validate counts and string quality.
 */

/** @param {string[]} qids Wikidata Q-ids without "Q" prefix issues — pass full Q123 form */
export function minusExcludedTypes(excludeQids) {
  if (!excludeQids?.length) return '';
  const values = excludeQids.map((q) => `wd:${q}`).join(' ');
  return `
  MINUS {
    ?item wdt:P31/wdt:P279* ?excludedType .
    VALUES ?excludedType { ${values} }
  }`;
}

/**
 * @param {{ dynastyQid: string, labelLang: string, excludeInstanceOf?: string[] }} opts
 */
export function personCountQuery(opts) {
  const { dynastyQid, labelLang, excludeInstanceOf = [] } = opts;
  return `
SELECT (COUNT(DISTINCT ?item) AS ?count) WHERE {
  ?item wdt:P31 wd:Q5 ;
        wdt:P27 wd:${dynastyQid} .
  ?item rdfs:label ?itemLabel .
  FILTER(LANG(?itemLabel) = "${labelLang}")
  ${minusExcludedTypes(excludeInstanceOf)}
}
`.trim();
}

/**
 * @param {{ dynastyQid: string, labelLang: string, excludeInstanceOf?: string[], limit?: number }} opts
 */
export function personSampleQuery(opts) {
  const { dynastyQid, labelLang, excludeInstanceOf = [], limit = 500 } = opts;
  return `
SELECT ?item ?itemLabel ?alias ?familyName ?givenName ?birth ?death WHERE {
  ?item wdt:P31 wd:Q5 ;
        wdt:P27 wd:${dynastyQid} .
  ?item rdfs:label ?itemLabel .
  FILTER(LANG(?itemLabel) = "${labelLang}")
  OPTIONAL {
    ?item skos:altLabel ?alias .
    FILTER(LANG(?alias) = "${labelLang}")
  }
  OPTIONAL { ?item wdt:P734 ?familyNameRaw . ?familyNameRaw rdfs:label ?familyName . FILTER(LANG(?familyName) = "${labelLang}") }
  OPTIONAL { ?item wdt:P735 ?givenNameRaw . ?givenNameRaw rdfs:label ?givenName . FILTER(LANG(?givenName) = "${labelLang}") }
  OPTIONAL { ?item wdt:P569 ?birth }
  OPTIONAL { ?item wdt:P570 ?death }
  ${minusExcludedTypes(excludeInstanceOf)}
}
LIMIT ${limit}
`.trim();
}

/**
 * Labels and aliases shared by more than one person in the dynasty slice.
 * @param {{ dynastyQid: string, labelLang: string, excludeInstanceOf?: string[], limit?: number }} opts
 */
export function personAmbiguityQuery(opts) {
  const { dynastyQid, labelLang, excludeInstanceOf = [], limit = 100 } = opts;
  return `
SELECT ?label (COUNT(DISTINCT ?item) AS ?entityCount) WHERE {
  {
    SELECT ?item ?label WHERE {
      ?item wdt:P31 wd:Q5 ;
            wdt:P27 wd:${dynastyQid} .
      ?item rdfs:label ?label .
      FILTER(LANG(?label) = "${labelLang}")
      ${minusExcludedTypes(excludeInstanceOf)}
    }
  }
  UNION
  {
    SELECT ?item ?label WHERE {
      ?item wdt:P31 wd:Q5 ;
            wdt:P27 wd:${dynastyQid} .
      ?item skos:altLabel ?label .
      FILTER(LANG(?label) = "${labelLang}")
      ${minusExcludedTypes(excludeInstanceOf)}
    }
  }
}
GROUP BY ?label
HAVING (COUNT(DISTINCT ?item) > 1)
ORDER BY DESC(?entityCount)
LIMIT ${limit}
`.trim();
}

/**
 * Place prototype — geographic instances with a label in the target language.
 * No dynasty filter (places use P1480 / CHGIS later in W2).
 * @param {{ labelLang: string, instanceOf: string[], excludeInstanceOf?: string[], limit?: number }} opts
 */
export function placeCountQuery(opts) {
  const { labelLang, instanceOf, excludeInstanceOf = [] } = opts;
  const typeValues = instanceOf.map((q) => `wd:${q}`).join(' ');
  return `
SELECT (COUNT(DISTINCT ?item) AS ?count) WHERE {
  ?item wdt:P31/wdt:P279* ?placeType .
  VALUES ?placeType { ${typeValues} }
  ?item rdfs:label ?itemLabel .
  FILTER(LANG(?itemLabel) = "${labelLang}")
  ${minusExcludedTypes(excludeInstanceOf)}
}
`.trim();
}

/**
 * @param {{ labelLang: string, instanceOf: string[], excludeInstanceOf?: string[], limit?: number }} opts
 */
export function placeAmbiguityQuery(opts) {
  const { labelLang, instanceOf, excludeInstanceOf = [], limit = 100 } = opts;
  const typeValues = instanceOf.map((q) => `wd:${q}`).join(' ');
  return `
SELECT ?label (COUNT(DISTINCT ?item) AS ?entityCount) WHERE {
  {
    SELECT ?item ?label WHERE {
      ?item wdt:P31/wdt:P279* ?placeType .
      VALUES ?placeType { ${typeValues} }
      ?item rdfs:label ?label .
      FILTER(LANG(?label) = "${labelLang}")
      ${minusExcludedTypes(excludeInstanceOf)}
    }
  }
  UNION
  {
    SELECT ?item ?label WHERE {
      ?item wdt:P31/wdt:P279* ?placeType .
      VALUES ?placeType { ${typeValues} }
      ?item skos:altLabel ?label .
      FILTER(LANG(?label) = "${labelLang}")
      ${minusExcludedTypes(excludeInstanceOf)}
    }
  }
}
GROUP BY ?label
HAVING (COUNT(DISTINCT ?item) > 1)
ORDER BY DESC(?entityCount)
LIMIT ${limit}
`.trim();
}
