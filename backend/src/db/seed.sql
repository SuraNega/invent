-- ============================================================
-- Momi's Kitchenware — Seed Data
-- Run: psql -U postgres -d clothtrack -f src/db/seed.sql
-- Default owner login: username=admin  password=admin123
-- ============================================================

-- ── DEFAULT OWNER ACCOUNT ────────────────────────────────────
-- password_hash is bcrypt of 'admin123' (cost 10)
INSERT INTO users (full_name, username, password_hash, role, is_active)
VALUES (
  'Admin Owner',
  'admin',
  '$2a$10$4huifd5GYbV/AxqrJIzBYOZrg4TmL5tk83qIfn3ckl3TXyb3btuee',
  'owner',
  TRUE
)
ON CONFLICT (username) DO NOTHING;

-- ── KITCHENWARE CATEGORIES (clean-slate) ─────────────────────
-- Delete old categories to prevent duplicates (no products reference these yet in a fresh seed)
DELETE FROM categories;

INSERT INTO categories (name, description) VALUES
  ('Cookware',                 'Pots, pans, woks, saucepans, and cooking vessels'),
  ('Bakeware',                 'Baking trays, cake pans, molds, and oven-safe tools'),
  ('Knives & Cutting Boards',  'Kitchen knives, knife sets, sharpeners, and cutting boards'),
  ('Kitchen Utensils & Tools', 'Spatulas, ladles, tongs, peelers, graters, and everyday tools'),
  ('Storage & Containers',     'Food containers, jars, lunch boxes, and storage organizers'),
  ('Glassware & Drinkware',    'Glasses, mugs, cups, pitchers, and drink service items'),
  ('Dinnerware & Tableware',   'Plates, bowls, serving dishes, trays, and table settings'),
  ('Kitchen Accessories',      'Racks, mats, strainers, funnels, and cleaning accessories'),
  ('Sets & Gift Sets',         'Bundled cookware, dinnerware, utensil, and gift sets');

-- ── SAMPLE SUPPLIERS ─────────────────────────────────────────
INSERT INTO suppliers (name, phone, email, address, notes) VALUES
  (
    'Addis Kitchenware Wholesale',
    '+251911234567',
    'orders@addiskitchenware.et',
    'Bole Road, Addis Ababa, Ethiopia',
    'Primary local kitchenware supplier. Delivers within 2-3 business days.'
  ),
  (
    'Global Home Goods Imports',
    '+251922345678',
    'supply@globalhomegoods.et',
    'Megenagna, Addis Ababa, Ethiopia',
    'Imports branded cookware, dinnerware, and storage products. Minimum order: 24 units per item.'
  ),
  (
    'Merkato Kitchen Tools Depot',
    '+251933456789',
    'sales@merkato-kitchen.et',
    'Merkato, Addis Ababa, Ethiopia',
    'Bulk utensils, containers, and tableware. Weekly delivery schedule.'
  )
ON CONFLICT DO NOTHING;
