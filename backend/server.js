'use strict';

require('dotenv').config();
const app = require('./src/app');

const PORT = process.env.PORT || 3000;

async function start() {
  const pool = require('./src/config/db');
  try {
    await pool.query('SELECT 1');
    console.log('[DB] PostgreSQL connected successfully');

    app.listen(PORT, () => {
      console.log(`[SERVER] Momi's Kitchenware API running on http://localhost:${PORT}`);
      console.log(`[SERVER] Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (err) {
    console.error('[DB] Failed to connect to PostgreSQL:', err.message);
    process.exit(1);
  }
}

// Local / Railway: run as a standalone server. Vercel Services: export the app.
if (require.main === module) {
  start();
}

module.exports = app;
