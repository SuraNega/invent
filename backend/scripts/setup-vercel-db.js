'use strict';

/**
 * Reset schema + seed on Vercel/Neon Postgres using env connection vars.
 * Run locally after: vercel env pull .env.local
 *   cd backend && node scripts/setup-vercel-db.js
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

  if (!status.configured) {
    console.error('No Postgres URL found. Run: vercel env pull .env.local');
    process.exit(1);
  }

  await pool.query('SELECT 1');
  console.log('[DB] connected');

  const dbDir = path.join(__dirname, '../src/db');
  await runSqlFile(path.join(dbDir, 'drop.sql'));
  await runSqlFile(path.join(dbDir, 'schema.sql'));
  await runSqlFile(path.join(dbDir, 'seed.sql'));

  console.log('[DB] setup complete — default login: admin / admin123');
  await pool.end();
}

main().catch((err) => {
  console.error('[DB] setup failed:', err.message);
  process.exit(1);
});
