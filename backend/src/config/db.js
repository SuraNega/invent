'use strict';

require('dotenv').config();

const ENV_KEYS = [
  'POSTGRES_URL',
  'DATABASE_URL',
  'POSTGRES_PRISMA_URL',
  'POSTGRES_URL_NON_POOLING',
];

function resolveConnectionString() {
  for (const key of ENV_KEYS) {
    const value = process.env[key];
    if (value && value.trim()) {
      return { connectionString: value.trim(), source: key };
    }
  }

  for (const [key, value] of Object.entries(process.env)) {
    if (!value || !value.trim()) continue;
    if (/^POSTGRES.*URL$/i.test(key) && !/NON_POOLING/i.test(key)) {
      return { connectionString: value.trim(), source: key };
    }
  }

  return null;
}

function resolveDiscreteConfig() {
  const host = process.env.DB_HOST || process.env.POSTGRES_HOST;
  const user = process.env.DB_USER || process.env.POSTGRES_USER;
  const password = process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD;
  const database = process.env.DB_NAME || process.env.POSTGRES_DATABASE;
  const port = parseInt(
    process.env.DB_PORT || process.env.POSTGRES_PORT || '5432',
    10
  );

  if (host && user && database) {
    return { host, port, database, user, password, source: 'POSTGRES_HOST' };
  }

  return null;
}

function needsSsl(connectionString) {
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') return true;
  if (!connectionString) return false;
  return (
    /sslmode=require/i.test(connectionString) ||
    /neon\.tech/i.test(connectionString) ||
    /vercel-storage\.com/i.test(connectionString)
  );
}

function createPool() {
  const resolved = resolveConnectionString();
  const discrete = resolved ? null : resolveDiscreteConfig();
  const isServerless = Boolean(process.env.VERCEL);

  if (resolved) {
    const { connectionString, source } = resolved;
    const ssl = needsSsl(connectionString) ? { rejectUnauthorized: false } : false;
    const poolConfig = {
      connectionString,
      ssl,
      max: isServerless ? 1 : 10,
      idleTimeoutMillis: isServerless ? 5000 : 30000,
      connectionTimeoutMillis: 15000,
    };

    if (isServerless) {
      const { Pool: NeonPool, neonConfig } = require('@neondatabase/serverless');
      neonConfig.poolQueryViaFetch = true;
      neonConfig.fetchConnectionCache = true;
      const pool = new NeonPool(poolConfig);
      pool.__dbSource = source;
      return pool;
    }

    const { Pool } = require('pg');
    const pool = new Pool(poolConfig);
    pool.__dbSource = source;
    return pool;
  }

  if (discrete) {
    const { host, port, database, user, password, source } = discrete;
    const ssl = needsSsl() ? { rejectUnauthorized: false } : false;
    const { Pool } = require('pg');
    const pool = new Pool({
      host,
      port,
      database,
      user,
      password,
      ssl,
      max: isServerless ? 1 : 10,
      idleTimeoutMillis: isServerless ? 5000 : 30000,
      connectionTimeoutMillis: 15000,
    });
    pool.__dbSource = source;
    return pool;
  }

  if (process.env.VERCEL) {
    console.error(
      '[DB] Missing Postgres env vars on Vercel. Storage → Postgres → Connect to Project → redeploy backend.'
    );
  }

  const { Pool } = require('pg');
  return new Pool({
    host: 'localhost',
    port: 5432,
    database: 'kitchenware',
    user: 'postgres',
    password: process.env.DB_PASSWORD || '1234',
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });
}

const pool = createPool();

pool.on('error', (err) => {
  console.error('[DB] Unexpected PostgreSQL pool error:', err.message);
});

function getDbStatus() {
  const resolved = resolveConnectionString();
  const discrete = resolveDiscreteConfig();
  return {
    configured: Boolean(resolved || discrete),
    source: pool.__dbSource || (resolved?.source ?? discrete?.source ?? 'localhost-fallback'),
    serverless: Boolean(process.env.VERCEL),
  };
}

module.exports = pool;
module.exports.getDbStatus = getDbStatus;
module.exports.resolveConnectionString = resolveConnectionString;
