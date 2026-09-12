-- ============================================================
-- Momi's Kitchenware — Role rename migration
-- Old roles: owner, manager, cashier
-- New roles: owner, cashier, sales
--   manager  → cashier
--   cashier  → sales
--
-- Run on existing databases:
--   psql -U postgres -d clothtrack -f src/db/migrate_roles.sql
-- ============================================================

-- Rename cashier → sales first (frees the name "cashier")
ALTER TYPE user_role RENAME VALUE 'cashier' TO 'sales';

-- Rename manager → cashier
ALTER TYPE user_role RENAME VALUE 'manager' TO 'cashier';
