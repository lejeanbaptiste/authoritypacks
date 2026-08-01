import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { extractSqliteSchemas, buildNorbertSqlite } from './sqlToSqlite.mjs';

test('extractSqliteSchemas maps MySQL CREATE TABLE to SQLite', () => {
  const sql = `
CREATE TABLE \`person\` (
  \`id\` int NOT NULL,
  \`can_name\` varchar(50) DEFAULT NULL,
  \`mythical\` bit(1) DEFAULT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB;
CREATE TABLE \`nat_raw\` (
  \`ind\` int NOT NULL,
  \`string\` char(255) DEFAULT NULL
) ENGINE=InnoDB;
CREATE TABLE \`date_dynasties\` (
  \`id\` int NOT NULL
) ENGINE=InnoDB;
`;
  const schemas = extractSqliteSchemas(sql);
  assert.ok(schemas.has('person'));
  assert.ok(schemas.has('nat_raw'));
  assert.ok(!schemas.has('date_dynasties'));
  assert.match(schemas.get('person').ddl, /"id" INTEGER/);
  assert.match(schemas.get('person').ddl, /"can_name" TEXT/);
});

test('buildNorbertSqlite loads rows and dynasty_labels', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'norbert-sqlite-'));
  const sqlPath = path.join(dir, 'dump.sql');
  const labelsPath = path.join(dir, 'dynasty-labels.json');
  const outPath = path.join(dir, 'norbert.sqlite3');
  fs.writeFileSync(
    sqlPath,
    [
      'CREATE TABLE `person` (',
      '  `id` int NOT NULL,',
      '  `can_name` varchar(50) DEFAULT NULL,',
      '  `f` bit(1) DEFAULT NULL,',
      '  `description` text,',
      '  `mythical` bit(1) DEFAULT NULL',
      ') ENGINE=InnoDB;',
      "INSERT INTO `person` VALUES (1,'王安石',NULL,'政治家',NULL);",
      'CREATE TABLE `person_names` (',
      '  `ind` int NOT NULL,',
      '  `person_id` int DEFAULT NULL,',
      '  `name` varchar(50) DEFAULT NULL,',
      '  `name_type_id` smallint DEFAULT NULL',
      ') ENGINE=InnoDB;',
      "INSERT INTO `person_names` VALUES (1,1,'王',0),(2,1,'安石',1);",
      '',
    ].join('\n'),
  );
  fs.writeFileSync(
    labelsPath,
    JSON.stringify({ dynasties: { 7: { zh: '宋', en: 'Song', startYear: 960, endYear: 1279 } } }),
  );
  await buildNorbertSqlite({ sqlPath, labelsPath, outPath });
  const db = new Database(outPath, { readonly: true });
  assert.equal(db.prepare('SELECT can_name FROM person WHERE id = 1').get().can_name, '王安石');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM person_names').get().n, 2);
  assert.equal(db.prepare('SELECT zh FROM dynasty_labels WHERE id = 7').get().zh, '宋');
  db.close();
});
