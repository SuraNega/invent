-- ============================================================
-- Momi's Kitchenware — Drop all database objects
-- ============================================================

DROP TABLE IF EXISTS qr_print_log CASCADE;
DROP TABLE IF EXISTS low_stock_alerts CASCADE;
DROP TABLE IF EXISTS stock_movements CASCADE;
DROP TABLE IF EXISTS returns CASCADE;
DROP TABLE IF EXISTS sale_items CASCADE;
DROP TABLE IF EXISTS sales CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS suppliers CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS users CASCADE;

DROP TYPE IF EXISTS print_method CASCADE;
DROP TYPE IF EXISTS refund_type CASCADE;
DROP TYPE IF EXISTS return_condition CASCADE;
DROP TYPE IF EXISTS return_reason CASCADE;
DROP TYPE IF EXISTS payment_method CASCADE;
DROP TYPE IF EXISTS movement_type CASCADE;
DROP TYPE IF EXISTS user_role CASCADE;

DROP FUNCTION IF EXISTS set_updated_at() CASCADE;
