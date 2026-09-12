# Momi's Kitchenware Backend — API Documentation

Documentation for frontend developers. This backend powers the **Momi's Kitchenware** inventory management system (products, stock, sales, returns, QR labels, alerts, reports).

---

## What Is Completed

| Area | Status | Notes |
|------|--------|--------|
| PostgreSQL database `clothtrack` | Done | 10 tables, indexes, triggers |
| Schema + seed SQL | Done | `src/db/drop.sql`, `src/db/schema.sql`, `src/db/seed.sql` |
| Node.js + Express API | Done | Modular routes under `src/modules/` |
| JWT authentication | Done | Login, logout, `/me` |
| Role-based access | Done | `owner`, `cashier`, `sales` |
| Users (staff) CRUD | Done | Owner manages accounts |
| Categories & suppliers | Done | Full CRUD |
| Products + SKU auto-generate | Done | Format: `KIT-YYYYMMDD-0001` |
| QR scan lookup by SKU | Done | `GET /api/products/sku/:sku` |
| Stock movements (audit log) | Done | Read-only API |
| Sales (POS checkout) | Done | Atomic transaction + stock update |
| Returns | Done | Restock if `resellable` |
| Low-stock alerts | Done | Auto-created on low quantity |
| QR label generation | Done | Base64 PNG + print log |
| Reports | Done | Sales, stock, returns summaries |
| Health check | Done | `GET /health` (no auth) |

**Default login (after seed):**

- Username: `admin`
- Password: `admin123`
- Role: `owner`

---

## Base URL & Running Locally

| Item | Value |
|------|--------|
| Default port | Check `.env` → `PORT` (often `3001` if 3000 is busy) |
| Base URL | `http://localhost:3001` |
| API prefix | `/api` |
| Health (no auth) | `GET http://localhost:3001/health` |

```bash
cd backend
npm install
# Reset database and reapply schema/seed
npm run db:reset
# Existing DBs with old roles (manager/cashier): npm run db:migrate-roles
npm run dev
```

---

## Authentication

### How it works

1. Call `POST /api/auth/login` with username + password (no token needed).
2. Response includes a **JWT** in `data.token`.
3. Send that token on every other API request:

```http
Authorization: Bearer <your_jwt_token>
```

4. Token expires after `JWT_EXPIRES_IN` (default `8h`).

### Roles

| Role | Typical use |
|------|-------------|
| `owner` | Full access, reports, delete, user management |
| `cashier` | Products, stock, sales list, most CRUD |
| `sales` | POS sales, returns, product lookup, QR |

If a route requires a role you do not have, the API returns **403**.

---

## Response Format

### Success

```json
{
  "success": true,
  "data": { }
}
```

Created resources often use status **201**.

### Error

```json
{
  "success": false,
  "message": "Error description"
}
```

Validation errors may include:

```json
{
  "success": false,
  "errors": [
    { "msg": "Product name is required", "path": "name", ... }
  ]
}
```

### Common HTTP status codes

| Code | Meaning |
|------|---------|
| 200 | OK |
| 201 | Created |
| 400 | Bad request / validation |
| 401 | Missing or invalid token |
| 403 | Wrong role |
| 404 | Not found |
| 409 | Conflict (e.g. duplicate username) |
| 500 | Server error |

---

## Database Tables (Quick Reference)

| Table | Purpose |
|-------|---------|
| `users` | Staff logins and roles |
| `categories` | Product types (cookware, bakeware, tools, etc.) |
| `suppliers` | Who supplies products |
| `products` | Kitchenware items, SKU, capacity, material, brand, price, stock qty |
| `stock_movements` | Every stock in/out (audit trail) |
| `sales` | Checkout transactions |
| `sale_items` | Line items per sale |
| `returns` | Customer returns |
| `low_stock_alerts` | Alerts when qty ≤ threshold |
| `qr_print_log` | History of label prints |

---

## Project Structure

```
backend/
├── server.js                 # Entry point
├── src/
│   ├── app.js                # Express app + route mounting
│   ├── config/db.js          # PostgreSQL connection pool
│   ├── db/
│   │   ├── drop.sql          # Drop all objects for a clean rebuild
│   │   ├── schema.sql        # Create all tables
│   │   └── seed.sql          # Admin user + sample data
│   ├── middleware/
│   │   ├── auth.js           # JWT verify
│   │   ├── authorize.js      # Role guard
│   │   └── errorHandler.js
│   ├── modules/              # One folder per feature
│   │   ├── auth/
│   │   ├── users/
│   │   ├── categories/
│   │   ├── suppliers/
│   │   ├── products/
│   │   ├── stock/
│   │   ├── sales/
│   │   ├── returns/
│   │   ├── alerts/
│   │   ├── qr/
│   │   └── reports/
│   └── utils/lowStockChecker.js
└── BACKEND_API.md            # This file
```

---

## API Endpoints (Full List)

Legend:

- **Auth**: `Public` = no token; `JWT` = Bearer token required
- **Roles**: who can call (if not listed, any logged-in user)

---

### Health

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/health` | Public | Server status |

**Response example:**

```json
{
  "success": true,
  "message": "Momi's Kitchenware API is running",
  "timestamp": "2026-06-01T17:42:12.999Z"
}
```

---

### Auth — `/api/auth`

| Method | Endpoint | Auth | Roles | Description |
|--------|----------|------|-------|-------------|
| POST | `/api/auth/login` | Public | — | Login, get JWT |
| POST | `/api/auth/logout` | JWT | any | Logout (client drops token) |
| GET | `/api/auth/me` | JWT | any | Current user profile |

**POST `/api/auth/login` — body:**

```json
{
  "username": "admin",
  "password": "admin123"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": 1,
      "full_name": "Admin Owner",
      "username": "admin",
      "role": "owner"
    }
  }
}
```

---

### Users (Staff) — `/api/users`

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/api/users` | owner, cashier | List all staff |
| GET | `/api/users/:id` | owner, cashier | Get one user |
| POST | `/api/users` | owner | Create staff account |
| PATCH | `/api/users/:id` | owner | Update name, username, role, is_active |
| PATCH | `/api/users/:id/password` | owner | Reset password |
| DELETE | `/api/users/:id` | owner | Deactivate user (soft delete) |

**POST body (create):**

```json
{
  "full_name": "Jane Cashier",
  "username": "jane",
  "password": "secret123",
  "role": "sales"
}
```

`role`: `owner` | `cashier` | `sales`

---

### Categories — `/api/categories`

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/api/categories` | any | List categories (+ product count) |
| GET | `/api/categories/:id` | any | One category |
| POST | `/api/categories` | owner, cashier | Create |
| PATCH | `/api/categories/:id` | owner, cashier | Update |
| DELETE | `/api/categories/:id` | owner | Delete (only if no active products) |

**POST body:**

```json
{
  "name": "Cookware",
  "description": "Optional description"
}
```

---

### Suppliers — `/api/suppliers`

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/api/suppliers` | any | List suppliers (+ product count) |
| GET | `/api/suppliers/:id` | any | One supplier |
| POST | `/api/suppliers` | owner, cashier | Create |
| PATCH | `/api/suppliers/:id` | owner, cashier | Update |
| DELETE | `/api/suppliers/:id` | owner | Delete (only if no active products) |

**POST body:**

```json
{
  "name": "Addis Textile PLC",
  "phone": "+251911234567",
  "email": "orders@example.com",
  "address": "Addis Ababa",
  "notes": "Optional"
}
```

---

### Products — `/api/products`

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/api/products` | any | List products (filters below) |
| GET | `/api/products/sku/:sku` | any | **QR scan** — lookup by SKU |
| GET | `/api/products/:id` | any | One product (full detail) |
| POST | `/api/products` | owner, cashier | Create product |
| PATCH | `/api/products/:id` | owner | Update product info (name, size, color, prices, etc.) |
| PATCH | `/api/products/:id/adjust-stock` | owner, cashier | Manual stock in/out |
| DELETE | `/api/products/:id` | owner | Remove product (smart delete — see below) |

**GET `/api/products` — query params:**

| Param | Example | Description |
|-------|---------|-------------|
| `category_id` | `4` | Filter by category |
| `supplier_id` | `2` | Filter by supplier |
| `size` | `28 cm` | Filter by size/capacity |
| `color` | `Silver` | Filter by color/finish |
| `material` | `Stainless Steel` | Filter by material |
| `brand` | `Momi` | Filter by brand |
| `search` | `saucepan` | Search name or SKU |

**POST body (create):**

```json
{
  "name": "Stainless Steel Saucepan",
  "unit_price": 850,
  "cost_price": 500,
  "category_id": 1,
  "supplier_id": 1,
  "size": "28 cm",
  "color": "Silver",
  "material": "Stainless Steel",
  "brand": "Momi",
  "unit_of_sale": "piece",
  "set_pieces": null,
  "quantity": 20,
  "low_stock_threshold": 5,
  "description": "Optional care or warranty note"
}
```

- `sku` is auto-generated if omitted (`KIT-YYYYMMDD-0001`).
- Initial `quantity` creates a `stock_in` movement automatically.

**PATCH `/api/products/:id` — body (all fields optional):**

```json
{
  "name": "Stainless Steel Saucepan",
  "unit_price": 850,
  "cost_price": 500,
  "category_id": 1,
  "supplier_id": 1,
  "size": "28 cm",
  "color": "Silver",
  "material": "Stainless Steel",
  "brand": "Momi",
  "unit_of_sale": "piece",
  "set_pieces": null,
  "low_stock_threshold": 5,
  "description": "Optional care or warranty note"
}
```

- Does **not** change `quantity` or `sku` — use adjust-stock for quantity changes.
- **Owner only** (cashiers cannot edit product metadata).

**PATCH `/api/products/:id/adjust-stock` — body:**

```json
{
  "quantity_change": 10,
  "notes": "New delivery from supplier"
}
```

- Positive number = add stock.
- Negative number = remove stock.
- Cannot go below 0.

**DELETE `/api/products/:id` — smart removal (owner only):**

**Zero stock** — no body required:

- If the product has no sales, returns, or stock movements → **hard delete** (permanently removed).
- Otherwise → **soft delete** (`is_active = false`, hidden from catalog; history preserved).

**In stock (`quantity > 0`)** — body required:

```json
{
  "strategy": "write_off"
}
```

or

```json
{
  "strategy": "transfer",
  "replacement_name": "Revised Product Name"
}
```

| Strategy | Behavior |
|----------|----------|
| `write_off` | Records a `damaged` stock movement, zeros quantity, resolves low-stock alerts, soft-deletes product |
| `transfer` | Creates a new product (copies category, size, color, prices, etc.; new auto SKU), moves all stock via movements, soft-deletes the old product |

**Response example:**

```json
{
  "success": true,
  "data": {
    "message": "Product removed from catalog",
    "removal_type": "soft",
    "product": { "id": 1, "name": "...", "sku": "..." },
    "new_product": { "id": 2, "name": "...", "sku": "..." }
  }
}
```

`new_product` is present only when `strategy` is `transfer`. `removal_type` is `hard` or `soft`.

---

### Stock movements — `/api/stock`

Read-only audit log. Every sale, restock, adjustment, and return writes here.

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/api/stock` | owner, cashier | Full history (filters below) |
| GET | `/api/stock/product/:productId` | any | History for one product |

**GET `/api/stock` — query params:**

| Param | Values |
|-------|--------|
| `product_id` | Product ID |
| `type` | `stock_in`, `sale`, `adjustment`, `return`, `damaged` |
| `performed_by` | User ID |
| `date_from` | ISO date string |
| `date_to` | ISO date string |

---

### Sales (POS) — `/api/sales`

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/api/sales` | owner, cashier | List sales |
| GET | `/api/sales/:id` | any | Sale detail + line items |
| POST | `/api/sales` | any | **Complete checkout** |

**GET `/api/sales` — query params:**

| Param | Description |
|-------|-------------|
| `date_from`, `date_to` | Date range |
| `sold_by` | Cashier user ID |
| `payment_method` | `cash`, `card`, `mobile_money`, `other` |

**POST `/api/sales` — body (checkout):**

```json
{
  "items": [
    { "product_id": 1, "quantity": 2 },
    { "product_id": 3, "quantity": 1, "unit_price": 1200 }
  ],
  "payment_method": "cash",
  "notes": "Optional"
}
```

- `unit_price` per item is optional; defaults to product’s current `unit_price`.
- Server checks stock, deducts quantity, creates `sale_items` and `stock_movements` in one transaction.
- Low-stock alert is created automatically if quantity falls at or below threshold.

**Response includes:** `sale_code`, `total_amount`, `items[]` with product names.

---

### Returns — `/api/returns`

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/api/returns` | owner, cashier | List returns |
| GET | `/api/returns/:id` | any | One return |
| POST | `/api/returns` | any | Process a return |

**POST body:**

```json
{
  "product_id": 1,
  "quantity": 1,
  "reason": "wrong_item",
  "condition": "resellable",
  "refund_type": "cash",
  "sale_id": 5,
  "refund_amount": 850,
  "notes": "Optional"
}
```

| Field | Allowed values |
|-------|----------------|
| `reason` | `wrong_item`, `defective`, `changed_mind`, `other` |
| `condition` | `resellable`, `damaged`, `incomplete_set` |
| `refund_type` | `cash`, `store_credit`, `exchange` |

- **`resellable`**: stock is added back to inventory.
- **`damaged`** / **`incomplete_set`**: logged only, stock not restored.

---

### Low-stock alerts — `/api/alerts`

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/api/alerts` | any | Unresolved alerts only |
| GET | `/api/alerts/all` | owner, cashier | All alerts (incl. resolved) |
| PATCH | `/api/alerts/:id/resolve` | owner, cashier | Mark alert resolved |

**GET `/api/alerts/all` — query params:** `product_id`, `date_from`, `date_to`

---

### QR labels — `/api/qr`

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| POST | `/api/qr/generate/:productId` | any | Generate QR image + log print |
| GET | `/api/qr/log/product/:productId` | owner, cashier | Print history |

**POST body (optional):**

```json
{
  "copies": 2,
  "print_method": "qr"
}
```

`print_method`: `qr` | `barcode`

**Response includes:**

- `data.product` — id, name, sku
- `data.qr_image` — base64 data URL (`data:image/png;base64,...`) — use in `<img src="...">`
- `data.log` — print log row

---

### Reports — `/api/reports`

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/api/reports/sales/summary` | owner, cashier | Total revenue, items sold |
| GET | `/api/reports/sales/by-employee` | owner | Sales per staff member |
| GET | `/api/reports/sales/by-product` | owner, cashier | Top products |
| GET | `/api/reports/sales/trend` | owner, cashier | Daily revenue trend |
| GET | `/api/reports/sales/daily-staff` | owner, cashier | Per-staff sales & returns for one day |
| GET | `/api/reports/stock/history` | owner, cashier | Movement log with names |
| GET | `/api/reports/stock/valuation` | owner | Stock value (cost vs retail) |
| GET | `/api/reports/returns/summary` | owner, cashier | Returns breakdown |

**Common query params:** `date_from`, `date_to` (where applicable)

**GET `/api/reports/sales/by-product`:** optional `limit` (default 20)

**GET `/api/reports/sales/daily-staff`:** required `date` (`YYYY-MM-DD`)

Response:

```json
{
  "success": true,
  "data": {
    "date": "2026-06-08",
    "staff": [
      {
        "id": 2,
        "full_name": "Jane Cashier",
        "username": "jane",
        "sales_count": 3,
        "items_sold": 5,
        "total_revenue": "4500.00",
        "returns_count": 1,
        "returns_qty": 1,
        "total_refunded": "850.00",
        "sales": [
          {
            "sale_id": 5,
            "sale_code": "SALE-20260608-1234",
            "created_at": "2026-06-08T14:30:00.000Z",
            "total_amount": "1700.00",
            "items": [
              {
                "product_name": "Stainless Steel Saucepan",
                "product_sku": "KIT-20260601-0001",
                "quantity": 2,
                "unit_price": "850.00",
                "subtotal": "1700.00"
              }
            ]
          }
        ],
        "returns": [
          {
            "return_code": "RET-20260608-5678",
            "product_name": "Stainless Steel Saucepan",
            "quantity": 1,
            "refund_amount": "850.00",
            "created_at": "2026-06-08T16:00:00.000Z"
          }
        ]
      }
    ]
  }
}
```

Only staff with at least one sale or return on the given day are included.

---

## Frontend Flows (How Pieces Connect)

### 1. App startup

```
GET /health          → confirm API is up
POST /api/auth/login → store token + user.role
GET /api/auth/me     → refresh profile if needed
```

### 2. POS — scan QR and checkout

```
1. Scan QR → read SKU string
2. GET /api/products/sku/{sku}     → add to cart
3. POST /api/sales { items, payment_method }
4. Optional: GET /api/alerts         → show low-stock banner
```

### 3. Add new product + print label

```
1. GET /api/categories, GET /api/suppliers  → dropdowns
2. POST /api/products                       → get id + sku
3. POST /api/qr/generate/{productId}        → show/print QR image
```

### 4. Restock after delivery

```
PATCH /api/products/{id}/adjust-stock
{ "quantity_change": 50, "notes": "Supplier delivery" }
```

Or use positive `quantity_change` on adjust-stock; alerts may auto-resolve when stock goes above threshold (returns flow also resolves alerts).

### 5. Process customer return

```
POST /api/returns { product_id, quantity, reason, condition, refund_type, ... }
```

### 6. Dashboard / reports (owner/cashier)

```
GET /api/reports/sales/summary?date_from=...&date_to=...
GET /api/reports/sales/by-product
GET /api/alerts
```

---

## Enum Values (For Forms & Dropdowns)

**User role:** `owner`, `cashier`, `sales`

**Payment method:** `cash`, `card`, `mobile_money`, `other`

**Stock movement type:** `stock_in`, `sale`, `adjustment`, `return`, `damaged`

**Return reason:** `wrong_item`, `defective`, `changed_mind`, `other`

**Return condition:** `resellable`, `damaged`, `incomplete_set`

**Refund type:** `cash`, `store_credit`, `exchange`

**Print method:** `qr`, `barcode`

---

## Notes for Frontend

1. **CORS** is enabled for all origins in development.
2. **Rate limit:** 200 requests per 15 minutes per IP on `/api/*`.
3. **Product routes order:** Use `/api/products/sku/:sku` before `/api/products/:id` in your client; the backend already handles this.
4. **Soft deletes:** Deleted products/users are hidden (`is_active = false`), not removed from DB.
5. **Prices:** Sent and returned as numbers/decimals (e.g. `850.00`).
6. **Dates:** ISO 8601 strings in responses (`created_at`, etc.).

---

## Quick Test (curl)

```bash
# Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# Use token
curl http://localhost:3001/api/categories \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

---

*Momi's Kitchenware Backend v1.0 — Node.js + Express + PostgreSQL*
