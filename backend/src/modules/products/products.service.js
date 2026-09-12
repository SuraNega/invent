'use strict';

const pool           = require('../../config/db');
const { generateSKU } = require('./sku.helper');
const checkLowStock  = require('../../utils/lowStockChecker');

async function resolveSupplierId(supplierId, supplierName) {
  if (supplierId) return supplierId;
  const name = supplierName?.trim();
  if (!name) return null;

  const { rows } = await pool.query(
    'SELECT id FROM suppliers WHERE LOWER(name) = LOWER($1) LIMIT 1',
    [name]
  );
  if (rows.length) return rows[0].id;

  const { rows: created } = await pool.query(
    'INSERT INTO suppliers (name) VALUES ($1) RETURNING id',
    [name]
  );
  return created[0].id;
}

async function listProducts(filters = {}) {
  const conditions = ['p.is_active = TRUE'];
  const values     = [];
  let   idx        = 1;

  if (filters.category_id) { conditions.push(`p.category_id = $${idx++}`); values.push(filters.category_id); }
  if (filters.supplier_id) { conditions.push(`p.supplier_id = $${idx++}`); values.push(filters.supplier_id); }
  if (filters.size)        { conditions.push(`LOWER(p.size) = LOWER($${idx++})`); values.push(filters.size); }
  if (filters.color)       { conditions.push(`LOWER(p.color) = LOWER($${idx++})`); values.push(filters.color); }
  if (filters.material)    { conditions.push(`LOWER(p.material) = LOWER($${idx++})`); values.push(filters.material); }
  if (filters.brand)       { conditions.push(`LOWER(p.brand) = LOWER($${idx++})`); values.push(filters.brand); }
  if (filters.search) {
    conditions.push(`(LOWER(p.name) LIKE LOWER($${idx}) OR LOWER(p.sku) LIKE LOWER($${idx}))`);
    values.push(`%${filters.search}%`);
    idx++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT p.*,
            c.name AS category_name,
            s.name AS supplier_name,
            u.full_name AS created_by_name
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN suppliers  s ON s.id = p.supplier_id
     LEFT JOIN users      u ON u.id = p.created_by
     ${where}
     ORDER BY p.created_at DESC`,
    values
  );
  return rows;
}

async function getProductById(id) {
  const { rows } = await pool.query(
    `SELECT p.*,
            c.name AS category_name,
            s.name AS supplier_name,
            u.full_name AS created_by_name
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN suppliers  s ON s.id = p.supplier_id
     LEFT JOIN users      u ON u.id = p.created_by
     WHERE p.id = $1`,
    [id]
  );
  if (!rows.length) {
    const err = new Error('Product not found');
    err.status = 404;
    throw err;
  }
  return rows[0];
}

async function getProductBySku(sku) {
  const { rows } = await pool.query(
    `SELECT p.*,
            c.name AS category_name,
            s.name AS supplier_name
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN suppliers  s ON s.id = p.supplier_id
     WHERE p.sku = $1 AND p.is_active = TRUE`,
    [sku]
  );
  if (!rows.length) {
    const err = new Error('Product not found for this SKU');
    err.status = 404;
    throw err;
  }
  return rows[0];
}

async function createProduct(data, userId) {
  const sku = data.sku || await generateSKU();
  const supplierId = await resolveSupplierId(data.supplier_id, data.supplier_name);

  const { rows } = await pool.query(
    `INSERT INTO products
       (name, sku, category_id, supplier_id, size, color, material, brand, unit_of_sale, set_pieces,
        unit_price, cost_price, quantity, low_stock_threshold,
        description, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     RETURNING *`,
    [
      data.name,
      sku,
      data.category_id   || null,
      supplierId,
      data.size          || null,
      data.color         || null,
      data.material      || null,
      data.brand         || null,
      data.unit_of_sale  || 'piece',
      data.set_pieces    || null,
      data.unit_price,
      data.cost_price    || null,
      data.quantity      || 0,
      data.low_stock_threshold || 5,
      data.description   || null,
      userId,
    ]
  );

  const product = rows[0];

  if (product.quantity > 0) {
    await pool.query(
      `INSERT INTO stock_movements
         (product_id, movement_type, quantity_change, quantity_before, quantity_after, performed_by, notes)
       VALUES ($1, 'stock_in', $2, 0, $2, $3, 'Initial stock on product creation')`,
      [product.id, product.quantity, userId]
    );
  }

  await checkLowStock(product.id, product.quantity, product.low_stock_threshold);

  return product;
}

async function updateProduct(id, data) {
  if (data.supplier_name !== undefined || data.supplier_id !== undefined) {
    data.supplier_id = await resolveSupplierId(data.supplier_id, data.supplier_name);
    delete data.supplier_name;
  }

  const allowed = [
    'name', 'category_id', 'supplier_id', 'size', 'color', 'material', 'brand', 'unit_of_sale', 'set_pieces',
    'unit_price', 'cost_price', 'low_stock_threshold', 'description',
  ];
  const updates = [];
  const values  = [];
  let   idx     = 1;

  for (const key of allowed) {
    if (data[key] !== undefined) {
      updates.push(`${key} = $${idx++}`);
      values.push(data[key]);
    }
  }

  if (!updates.length) {
    const err = new Error('No valid fields to update');
    err.status = 400;
    throw err;
  }

  values.push(id);
  const { rows } = await pool.query(
    `UPDATE products SET ${updates.join(', ')} WHERE id = $${idx} AND is_active = TRUE RETURNING *`,
    values
  );
  if (!rows.length) {
    const err = new Error('Product not found');
    err.status = 404;
    throw err;
  }
  return rows[0];
}

async function adjustStock(productId, { quantity_change, notes }, userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      'SELECT quantity, low_stock_threshold FROM products WHERE id = $1 AND is_active = TRUE FOR UPDATE',
      [productId]
    );
    if (!rows.length) {
      const err = new Error('Product not found');
      err.status = 404;
      throw err;
    }

    const before = rows[0].quantity;
    const after  = before + quantity_change;

    if (after < 0) {
      const err = new Error(`Insufficient stock. Current: ${before}, requested change: ${quantity_change}`);
      err.status = 400;
      throw err;
    }

    await client.query('UPDATE products SET quantity = $1 WHERE id = $2', [after, productId]);

    await client.query(
      `INSERT INTO stock_movements
         (product_id, movement_type, quantity_change, quantity_before, quantity_after, performed_by, notes)
       VALUES ($1, 'adjustment', $2, $3, $4, $5, $6)`,
      [productId, quantity_change, before, after, userId, notes || null]
    );

    await client.query('COMMIT');

    await checkLowStock(productId, after, rows[0].low_stock_threshold);

    return { product_id: productId, quantity_before: before, quantity_after: after };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function resolveAlertsForProduct(productId, client) {
  const db = client || pool;
  await db.query(
    `UPDATE low_stock_alerts
     SET is_resolved = TRUE, resolved_at = NOW()
     WHERE product_id = $1 AND is_resolved = FALSE`,
    [productId]
  );
}

async function hasProductHistory(productId, client) {
  const db = client || pool;
  const { rows } = await db.query(
    `SELECT
       (SELECT COUNT(*)::int FROM sale_items WHERE product_id = $1) AS sales,
       (SELECT COUNT(*)::int FROM returns WHERE product_id = $1) AS returns,
       (SELECT COUNT(*)::int FROM stock_movements WHERE product_id = $1) AS movements`,
    [productId]
  );
  const { sales, returns, movements } = rows[0];
  return sales > 0 || returns > 0 || movements > 0;
}

async function deactivateProduct(productId, client) {
  const db = client || pool;
  const { rows } = await db.query(
    `UPDATE products SET is_active = FALSE WHERE id = $1 RETURNING id, name, sku`,
    [productId]
  );
  return rows[0];
}

async function removeProductRecord(productId, client) {
  const db = client || pool;
  const { rows } = await db.query(
    `DELETE FROM products WHERE id = $1 RETURNING id, name, sku`,
    [productId]
  );
  return rows[0];
}

async function writeOffAndDeactivate(product, userId, client) {
  const qty = product.quantity;
  if (qty > 0) {
    await client.query(
      `INSERT INTO stock_movements
         (product_id, movement_type, quantity_change, quantity_before, quantity_after, performed_by, notes)
       VALUES ($1, 'damaged', $2, $3, 0, $4, 'Written off on product removal')`,
      [product.id, -qty, qty, userId]
    );
    await client.query('UPDATE products SET quantity = 0 WHERE id = $1', [product.id]);
  }
  await resolveAlertsForProduct(product.id, client);
  return deactivateProduct(product.id, client);
}

async function transferStockToNewProduct(oldProduct, replacementName, userId, client) {
  const name = replacementName.trim();
  const { rows: dupRows } = await client.query(
    `SELECT id FROM products
     WHERE is_active = TRUE
       AND LOWER(name) = LOWER($1)
       AND COALESCE(LOWER(size), '') = COALESCE(LOWER($2), '')
       AND COALESCE(LOWER(color), '') = COALESCE(LOWER($3), '')
       AND COALESCE(LOWER(material), '') = COALESCE(LOWER($4), '')
       AND COALESCE(LOWER(brand), '') = COALESCE(LOWER($5), '')
       AND id != $6
     LIMIT 1`,
    [name, oldProduct.size, oldProduct.color, oldProduct.material, oldProduct.brand, oldProduct.id]
  );
  if (dupRows.length) {
    const err = new Error('An active product with this name, capacity, material, color, and brand already exists');
    err.status = 400;
    throw err;
  }

  const sku = await generateSKU();
  const qty = oldProduct.quantity;

  const { rows: newRows } = await client.query(
    `INSERT INTO products
       (name, sku, category_id, supplier_id, size, color, material, brand, unit_of_sale, set_pieces,
        unit_price, cost_price, quantity, low_stock_threshold,
        description, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     RETURNING *`,
    [
      name,
      sku,
      oldProduct.category_id,
      oldProduct.supplier_id,
      oldProduct.size,
      oldProduct.color,
      oldProduct.material,
      oldProduct.brand,
      oldProduct.unit_of_sale,
      oldProduct.set_pieces,
      oldProduct.unit_price,
      oldProduct.cost_price,
      qty,
      oldProduct.low_stock_threshold,
      oldProduct.description,
      userId,
    ]
  );
  const newProduct = newRows[0];

  if (qty > 0) {
    await client.query(
      `INSERT INTO stock_movements
         (product_id, movement_type, quantity_change, quantity_before, quantity_after, performed_by, notes)
       VALUES ($1, 'adjustment', $2, $3, 0, $4, $5)`,
      [oldProduct.id, -qty, qty, userId, `Stock transferred to ${newProduct.sku} on product removal`]
    );
    await client.query(
      `INSERT INTO stock_movements
         (product_id, movement_type, quantity_change, quantity_before, quantity_after, performed_by, notes)
       VALUES ($1, 'stock_in', $2, 0, $2, $3, $4)`,
      [newProduct.id, qty, userId, `Stock received from ${oldProduct.sku} on product removal`]
    );
    await client.query('UPDATE products SET quantity = 0 WHERE id = $1', [oldProduct.id]);
  }

  await resolveAlertsForProduct(oldProduct.id, client);
  const removed = await deactivateProduct(oldProduct.id, client);

  return { removed, new_product: newProduct };
}

async function deleteProduct(id, options = {}, userId) {
  const { strategy, replacement_name } = options;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT * FROM products WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (!rows.length) {
      const err = new Error('Product not found');
      err.status = 404;
      throw err;
    }

    const product = rows[0];
    if (!product.is_active) {
      const err = new Error('Product is already removed');
      err.status = 400;
      throw err;
    }

    const qty = product.quantity;

    if (qty > 0) {
      if (!strategy || !['write_off', 'transfer'].includes(strategy)) {
        const err = new Error('Products with stock require strategy: write_off or transfer');
        err.status = 400;
        throw err;
      }
      if (strategy === 'transfer') {
        if (!replacement_name?.trim()) {
          const err = new Error('replacement_name is required for transfer strategy');
          err.status = 400;
          throw err;
        }
        const result = await transferStockToNewProduct(product, replacement_name, userId, client);
        await client.query('COMMIT');
        await checkLowStock(result.new_product.id, result.new_product.quantity, result.new_product.low_stock_threshold);
        return {
          message: 'Product removed and stock transferred',
          removal_type: 'soft',
          product: result.removed,
          new_product: result.new_product,
        };
      }

      const removed = await writeOffAndDeactivate(product, userId, client);
      await client.query('COMMIT');
      return {
        message: 'Product written off and removed from catalog',
        removal_type: 'soft',
        product: removed,
      };
    }

    await resolveAlertsForProduct(product.id, client);
    const hasHistory = await hasProductHistory(product.id, client);

    if (!hasHistory) {
      const removed = await removeProductRecord(product.id, client);
      await client.query('COMMIT');
      return {
        message: 'Product permanently removed',
        removal_type: 'hard',
        product: removed,
      };
    }

    const removed = await deactivateProduct(product.id, client);
    await client.query('COMMIT');
    return {
      message: 'Product removed from catalog',
      removal_type: 'soft',
      product: removed,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  listProducts, getProductById, getProductBySku,
  createProduct, updateProduct, adjustStock, deleteProduct,
};
