'use strict';

const pool          = require('../../config/db');
const checkLowStock = require('../../utils/lowStockChecker');

function generateReturnCode() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `RET-${date}-${rand}`;
}

/**
 * Process a customer return atomically:
 *  - INSERT returns row
 *  - If condition = 'resellable' → restore stock + stock_movement(type='return')
 *  - If condition = 'damaged' or 'incomplete_set' → stock_movement(type='damaged'), no stock change
 *  - After commit: resolve any open low_stock_alert if stock now above threshold
 */
async function processReturn(data, userId) {
  const {
    sale_id, product_id, quantity, reason,
    condition, refund_type, refund_amount, notes,
  } = data;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: prodRows } = await client.query(
      'SELECT id, quantity, low_stock_threshold FROM products WHERE id = $1 AND is_active = TRUE FOR UPDATE',
      [product_id]
    );
    if (!prodRows.length) {
      throw Object.assign(new Error('Product not found'), { status: 404 });
    }
    const product   = prodRows[0];
    const return_code = generateReturnCode();

    const { rows: retRows } = await client.query(
      `INSERT INTO returns
         (return_code, sale_id, product_id, quantity, reason, condition,
          refund_type, refund_amount, processed_by, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        return_code,
        sale_id   || null,
        product_id,
        quantity,
        reason,
        condition,
        refund_type,
        refund_amount || null,
        userId,
        notes || null,
      ]
    );
    const returnRecord = retRows[0];

    const qty_before = product.quantity;
    let   qty_after  = qty_before;
    let   movType;

    if (condition === 'resellable') {
      qty_after = qty_before + quantity;
      movType   = 'return';

      await client.query('UPDATE products SET quantity = $1 WHERE id = $2', [qty_after, product_id]);
    } else {
      movType = 'damaged';
    }

    await client.query(
      `INSERT INTO stock_movements
         (product_id, movement_type, quantity_change, quantity_before, quantity_after,
          return_id, performed_by, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        product_id,
        movType,
        condition === 'resellable' ? quantity : 0,
        qty_before,
        qty_after,
        returnRecord.id,
        userId,
        `Return ${return_code}: ${reason}`,
      ]
    );

    await client.query('COMMIT');

    if (condition === 'resellable') {
      const { rows: alertRows } = await pool.query(
        `SELECT id FROM low_stock_alerts
         WHERE product_id = $1 AND is_resolved = FALSE
         LIMIT 1`,
        [product_id]
      );
      if (alertRows.length && qty_after > product.low_stock_threshold) {
        await pool.query(
          `UPDATE low_stock_alerts
           SET is_resolved = TRUE, resolved_at = NOW()
           WHERE id = $1`,
          [alertRows[0].id]
        );
      } else if (!alertRows.length) {
        await checkLowStock(product_id, qty_after, product.low_stock_threshold);
      }
    }

    return getReturnById(returnRecord.id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function listReturns(filters = {}) {
  const conditions = [];
  const values     = [];
  let   idx        = 1;

  if (filters.product_id) { conditions.push(`r.product_id = $${idx++}`); values.push(filters.product_id); }
  if (filters.reason)     { conditions.push(`r.reason = $${idx++}`);     values.push(filters.reason); }
  if (filters.condition)  { conditions.push(`r.condition = $${idx++}`);  values.push(filters.condition); }
  if (filters.date_from)  { conditions.push(`r.created_at >= $${idx++}`);values.push(filters.date_from); }
  if (filters.date_to)    { conditions.push(`r.created_at <= $${idx++}`);values.push(filters.date_to); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT r.*,
            p.name      AS product_name,
            p.sku       AS product_sku,
            u.full_name AS processed_by_name
     FROM returns r
     LEFT JOIN products p ON p.id = r.product_id
     LEFT JOIN users    u ON u.id = r.processed_by
     ${where}
     ORDER BY r.created_at DESC`,
    values
  );
  return rows;
}

async function getReturnById(id) {
  const { rows } = await pool.query(
    `SELECT r.*,
            p.name      AS product_name,
            p.sku       AS product_sku,
            u.full_name AS processed_by_name,
            s.sale_code
     FROM returns r
     LEFT JOIN products p ON p.id = r.product_id
     LEFT JOIN users    u ON u.id = r.processed_by
     LEFT JOIN sales    s ON s.id = r.sale_id
     WHERE r.id = $1`,
    [id]
  );
  if (!rows.length) {
    const err = new Error('Return not found');
    err.status = 404;
    throw err;
  }
  return rows[0];
}

module.exports = { processReturn, listReturns, getReturnById };
