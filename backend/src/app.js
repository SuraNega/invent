'use strict';

require('dotenv').config();
const express      = require('express');
const helmet       = require('helmet');
const cors         = require('cors');
const morgan       = require('morgan');
const rateLimit    = require('express-rate-limit');

const authRoutes       = require('./modules/auth/auth.routes');
const usersRoutes      = require('./modules/users/users.routes');
const categoriesRoutes = require('./modules/categories/categories.routes');
const suppliersRoutes  = require('./modules/suppliers/suppliers.routes');
const productsRoutes   = require('./modules/products/products.routes');
const stockRoutes      = require('./modules/stock/stock.routes');
const salesRoutes      = require('./modules/sales/sales.routes');
const returnsRoutes    = require('./modules/returns/returns.routes');
const alertsRoutes     = require('./modules/alerts/alerts.routes');
const qrRoutes         = require('./modules/qr/qr.routes');
const reportsRoutes    = require('./modules/reports/reports.routes');

const { authenticate }  = require('./middleware/auth');
const errorHandler      = require('./middleware/errorHandler');
const pool              = require('./config/db');
const { getDbStatus }   = require('./config/db');

const app = express();

// Required on Vercel so rate-limit and req.ip work behind the edge proxy.
if (process.env.VERCEL) {
  app.set('trust proxy', 1);
}

// Vercel Services strips the /api routePrefix before the request reaches Express.
const API_BASE = process.env.VERCEL ? '' : '/api';
const apiPath = (segment) => `${API_BASE}${segment}`;

// ── Security & logging ────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── Body parsing ──────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Health check (before rate limiter when API_BASE is empty) ─
const healthHandler = async (_req, res) => {
  const dbStatus = getDbStatus();
  const payload = {
    success: true,
    message: "Momi's Kitchenware API is running",
    timestamp: new Date(),
    db: dbStatus,
  };

  if (!dbStatus.configured) {
    return res.status(503).json({
      ...payload,
      success: false,
      message: 'Postgres env vars missing. Link Vercel Postgres to this project and redeploy.',
    });
  }

  try {
    await pool.query('SELECT 1');
    payload.db = { ...dbStatus, connected: true };
    return res.json(payload);
  } catch (err) {
    return res.status(503).json({
      ...payload,
      success: false,
      message: 'Database connection failed',
      db: { ...dbStatus, connected: false, error: err.code || err.message },
    });
  }
};
app.get('/health', healthHandler);
app.get(apiPath('/health'), healthHandler);

// ── Rate limiting ─────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});
if (API_BASE) {
  app.use(`${API_BASE}/`, limiter);
} else {
  app.use((req, res, next) => {
    if (req.path === '/health') return next();
    return limiter(req, res, next);
  });
}

// ── Public routes (no JWT required) ───────────────────────────
app.use(apiPath('/auth'), authRoutes);

// ── Protected routes (JWT required for all below) ─────────────
app.use(API_BASE || '/', authenticate);
app.use(apiPath('/users'),      usersRoutes);
app.use(apiPath('/categories'), categoriesRoutes);
app.use(apiPath('/suppliers'),  suppliersRoutes);
app.use(apiPath('/products'),   productsRoutes);
app.use(apiPath('/stock'),      stockRoutes);
app.use(apiPath('/sales'),      salesRoutes);
app.use(apiPath('/returns'),    returnsRoutes);
app.use(apiPath('/alerts'),     alertsRoutes);
app.use(apiPath('/qr'),         qrRoutes);
app.use(apiPath('/reports'),    reportsRoutes);

// ── 404 ───────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ── Global error handler ──────────────────────────────────────
app.use(errorHandler);

module.exports = app;
