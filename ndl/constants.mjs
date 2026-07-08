/** NDL RDF namespaces (from live authority records). */
export const NDL_PREFIXES = {
  foaf: 'http://xmlns.com/foaf/0.1/',
  xl: 'http://www.w3.org/2008/05/skos-xl#',
  ndl: 'http://ndl.go.jp/dcndl/terms/',
  rda: 'http://RDVocab.info/ElementsGr2/',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
};

export const NDL_SPARQL_ENDPOINT = 'https://id.ndl.go.jp/auth/ndla/sparql';
export const NDL_USER_AGENT = 'authority-extraction/0.1 (leaf-writer DH; contact: local dev)';
export const NDL_SPARQL_PAGE_SIZE = 1000;

/** Batch download — updated ~quarterly; see ndl/README.md. */
export const NDL_WORKS_ZIP_URL =
  'https://id.ndl.go.jp/information/wp-content/uploads/2026/04/work-tsv.zip';

export const NDL_ATTRIBUTION =
  'Data from Web NDL Authorities (National Diet Library). 国立国会図書館の「Web NDL Authorities」から取得した典拠データです。';

/** Use as `PREFIX ndla: <…>` — fragment id `geographicNames` (avoid raw `#` in SPARQL queries). */
export const NDL_AUTH_SCHEME_URI = 'http://id.ndl.go.jp/auth#';

/** @param {string} authUri e.g. http://id.ndl.go.jp/auth/ndlna/00054222 */
export function authorityIdFromUri(authUri) {
  const m = /\/ndlna\/(\d+)$/.exec(authUri ?? '');
  return m ? m[1] : '';
}
