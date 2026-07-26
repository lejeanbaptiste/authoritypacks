import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { compileCbdbOfficeGraph } from './compileRecords.mjs';

test('CBDB office graph exports the type tree and office memberships', () => {
  const db = new Database(':memory:');
  try {
    db.exec(`
      CREATE TABLE OFFICE_TYPE_TREE (
        c_office_type_node_id TEXT PRIMARY KEY,
        c_office_type_desc TEXT,
        c_office_type_desc_chn TEXT,
        c_parent_id TEXT
      );
      CREATE TABLE OFFICE_CODE_TYPE_REL (
        c_office_id INTEGER,
        c_office_tree_id TEXT
      );
      INSERT INTO OFFICE_TYPE_TREE VALUES
        ('06', 'Tang Dynasty', '唐朝', '0'),
        ('0603', 'Central Government', '中央官制類', '06');
      INSERT INTO OFFICE_CODE_TYPE_REL VALUES (42, '0603');
    `);
    const graph = compileCbdbOfficeGraph(db);
    assert.equal(graph.types[1].parentId, 'cbdb:office-type:06');
    assert.ok(
      graph.relations.some(
        (row) =>
          row.type === 'parentOf'
          && row.subject === 'cbdb:office-type:06'
          && row.object === 'cbdb:office-type:0603',
      ),
    );
    assert.ok(
      graph.relations.some(
        (row) =>
          row.type === 'belongsTo'
          && row.subject === 'cbdb:office:42'
          && row.object === 'cbdb:office-type:0603',
      ),
    );
  } finally {
    db.close();
  }
});
