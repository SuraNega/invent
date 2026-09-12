'use strict';

const pool = require('../../config/db');

/**
 * Generates a unique SKU in the format: KIT-YYYYMMDD-XXXX
 * where XXXX is zero-padded count of products created today + 1.
 */
async function generateSKU() {
  const now      = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');

  const { rows } = await pool.query(
    `SELECT COUNT(*) AS cnt FROM products WHERE sku LIKE $1`,
    [`KIT-${datePart}-%`]
  );

  const sequence = (parseInt(rows[0].cnt, 10) + 1).toString().padStart(4, '0');
  return `KIT-${datePart}-${sequence}`;
}

module.exports = { generateSKU };
