-- ============================================================
-- Momi's Kitchenware — PostgreSQL Schema
-- Run: psql -U postgres -d clothtrack -f src/db/schema.sql
-- ============================================================

-- ── ENUM TYPES ──────────────────────────────────────────────
CREATE TYPE user_role AS ENUM ('owner', 'cashier', 'sales');

CREATE TYPE movement_type AS ENUM (
  'stock_in', 'sale', 'adjustment', 'return', 'damaged'
);

CREATE TYPE payment_method AS ENUM (
  'cash', 'card', 'mobile_money', 'other'
);

CREATE TYPE return_reason AS ENUM (
  'wrong_item', 'defective', 'changed_mind', 'other'
);

CREATE TYPE return_condition AS ENUM (
  'resellable', 'damaged', 'incomplete_set'
);

CREATE TYPE refund_type AS ENUM (
  'cash', 'store_credit', 'exchange'
);

CREATE TYPE print_method AS ENUM ('qr', 'barcode');

-- ── TRIGGER FUNCTION for updated_at ─────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── TABLE 1: users ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  full_name     VARCHAR(100)  NOT NULL,
  username      VARCHAR(50)   NOT NULL UNIQUE,
  password_hash VARCHAR(255)  NOT NULL,
  role          user_role     NOT NULL DEFAULT 'sales',
  is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  last_login    TIMESTAMPTZ
);

-- ── TABLE 2: categories ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── TABLE 3: suppliers ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS suppliers (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(150) NOT NULL,
  phone      VARCHAR(20),
  email      VARCHAR(100),
  address    TEXT,
  notes      TEXT,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── TABLE 4: products ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id                  SERIAL PRIMARY KEY,
  name                VARCHAR(150)    NOT NULL,
  sku                 VARCHAR(50)     NOT NULL UNIQUE,
  category_id         INT             REFERENCES categories(id) ON DELETE SET NULL,
  supplier_id         INT             REFERENCES suppliers(id)  ON DELETE SET NULL,
  size                VARCHAR(30),
  color               VARCHAR(50),
  material            VARCHAR(50),
  brand               VARCHAR(100),
  unit_of_sale        VARCHAR(20)     NOT NULL DEFAULT 'piece',
  set_pieces          INT,
  unit_price          DECIMAL(10, 2)  NOT NULL,
  cost_price          DECIMAL(10, 2),
  quantity            INT             NOT NULL DEFAULT 0,
  low_stock_threshold INT             NOT NULL DEFAULT 5,
  qr_code             VARCHAR(255),
  qr_printed_at       TIMESTAMPTZ,
  description         TEXT,
  is_active           BOOLEAN         NOT NULL DEFAULT TRUE,
  created_by          INT             REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── TABLE 5: sales ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sales (
  id             SERIAL PRIMARY KEY,
  sale_code      VARCHAR(30)    NOT NULL UNIQUE,
  sold_by        INT            REFERENCES users(id) ON DELETE SET NULL,
  total_amount   DECIMAL(10, 2) NOT NULL DEFAULT 0,
  payment_method payment_method NOT NULL DEFAULT 'cash',
  notes          TEXT,
  created_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- ── TABLE 6: sale_items ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS sale_items (
  id         SERIAL PRIMARY KEY,
  sale_id    INT            NOT NULL REFERENCES sales(id)    ON DELETE CASCADE,
  product_id INT            NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity   INT            NOT NULL,
  unit_price DECIMAL(10, 2) NOT NULL,
  subtotal   DECIMAL(10, 2) NOT NULL,
  is_discounted BOOLEAN     NOT NULL DEFAULT FALSE
);

-- ── TABLE 7: returns ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS returns (
  id            SERIAL PRIMARY KEY,
  return_code   VARCHAR(30)      NOT NULL UNIQUE,
  sale_id       INT              REFERENCES sales(id)    ON DELETE SET NULL,
  product_id    INT              NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity      INT              NOT NULL,
  reason        return_reason    NOT NULL,
  condition     return_condition NOT NULL,
  refund_type   refund_type      NOT NULL,
  refund_amount DECIMAL(10, 2),
  processed_by  INT              REFERENCES users(id) ON DELETE SET NULL,
  notes         TEXT,
  created_at    TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

-- ── TABLE 8: stock_movements ─────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_movements (
  id              SERIAL PRIMARY KEY,
  product_id      INT           NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  movement_type   movement_type NOT NULL,
  quantity_change INT           NOT NULL,
  quantity_before INT           NOT NULL,
  quantity_after  INT           NOT NULL,
  unit_price      DECIMAL(10, 2),
  sale_id         INT           REFERENCES sales(id)   ON DELETE SET NULL,
  return_id       INT           REFERENCES returns(id) ON DELETE SET NULL,
  notes           TEXT,
  performed_by    INT           REFERENCES users(id)   ON DELETE SET NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── TABLE 9: low_stock_alerts ────────────────────────────────
CREATE TABLE IF NOT EXISTS low_stock_alerts (
  id               SERIAL PRIMARY KEY,
  product_id       INT         NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity_at_alert INT        NOT NULL,
  threshold        INT         NOT NULL,
  is_resolved      BOOLEAN     NOT NULL DEFAULT FALSE,
  alerted_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at      TIMESTAMPTZ
);

-- ── TABLE 10: qr_print_log ───────────────────────────────────
CREATE TABLE IF NOT EXISTS qr_print_log (
  id           SERIAL PRIMARY KEY,
  product_id   INT          NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  printed_by   INT          REFERENCES users(id) ON DELETE SET NULL,
  copies       INT          NOT NULL DEFAULT 1,
  print_method print_method NOT NULL DEFAULT 'qr',
  printed_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── INDEXES ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_products_sku            ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_category       ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_supplier       ON products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_products_active         ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_date    ON stock_movements(created_at);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type    ON stock_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_sales_created_at        ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_sold_by           ON sales(sold_by);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale         ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product      ON sale_items(product_id);
CREATE INDEX IF NOT EXISTS idx_returns_sale            ON returns(sale_id);
CREATE INDEX IF NOT EXISTS idx_returns_product         ON returns(product_id);
CREATE INDEX IF NOT EXISTS idx_alerts_product          ON low_stock_alerts(product_id);
CREATE INDEX IF NOT EXISTS idx_alerts_resolved         ON low_stock_alerts(is_resolved);
CREATE INDEX IF NOT EXISTS idx_qr_log_product          ON qr_print_log(product_id);
