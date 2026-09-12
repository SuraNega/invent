'use strict';

/**
 * Reset the configured Postgres database, then apply schema + seed.
 * Default owner login after reset: admin / admin123
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local') });
require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') });
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const pool = require('../src/config/db');
const { getDbStatus } = require('../src/config/db');

async function runSqlFile(filePath) {
  const sql = fs.readFileSync(filePath, 'utf8');
  await pool.query(sql);
  console.log(`[OK] ${path.basename(filePath)}`);
}

async function main() {
  const status = getDbStatus();
  console.log('[DB] status:', status);

  await pool.query('SELECT 1');
  console.log('[DB] connected');

  const dbDir = path.join(__dirname, '../src/db');
  await runSqlFile(path.join(dbDir, 'drop.sql'));
  await runSqlFile(path.join(dbDir, 'schema.sql'));
  await runSqlFile(path.join(dbDir, 'seed.sql'));

  console.log('[DB] reset complete - default login: admin / admin123');
  await pool.end();
}

main().catch(async (err) => {
  console.error('[DB] reset failed:', err.message);
  await pool.end().catch(() => {});
  process.exit(1);
});
