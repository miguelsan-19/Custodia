'use strict';

const crypto = require('crypto');
const pg = require('pg');

pg.types.setTypeParser(20, (v) => parseInt(v, 10));

const SC = 'cuentas';

let pool;

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('Falta la variable DATABASE_URL (cadena de conexión de tu base de datos Supabase).');
    }
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 4,
      ssl: { rejectUnauthorized: false }
    });
  }
  return pool;
}

function query(text, params) {
  return getPool().query(text, params);
}

function reply(res, status, obj) {
  res.status(status).json(obj);
}

function wrap(fn) {
  return async function (req, res) {
    try {
      await fn(req, res);
    } catch (err) {
      console.error(err);
      if (!res.headersSent) {
        reply(res, 500, { error: 'Error interno del servidor. Revisa que la base de datos esté conectada.' });
      }
    }
  };
}

function readToken(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : '';
}

async function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  await query(`INSERT INTO ${SC}.sessions (token) VALUES ($1)`, [token]);
  return token;
}

async function destroySession(req) {
  const t = readToken(req);
  if (t) await query(`DELETE FROM ${SC}.sessions WHERE token = $1`, [t]);
}

async function authed(req) {
  const t = readToken(req);
  if (!t) return false;
  const r = await query(`SELECT 1 FROM ${SC}.sessions WHERE token = $1`, [t]);
  return r.rowCount > 0;
}

async function requireAuth(req, res) {
  if (!(await authed(req))) {
    reply(res, 401, { error: 'No autorizado. Vuelve a ingresar.' });
    return false;
  }
  return true;
}

async function getSettings() {
  const r = await query(`SELECT * FROM ${SC}.settings WHERE id = 1`);
  return r.rows[0] || null;
}

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString('hex');
}

async function computeBalances() {
  const r = await query(`SELECT person_id, to_person_id, type, amount FROM ${SC}.movements`);
  const balances = {};
  for (const m of r.rows) {
    if (m.type === 'ingreso') {
      balances[m.person_id] = (balances[m.person_id] || 0) + m.amount;
    } else if (m.type === 'egreso') {
      balances[m.person_id] = (balances[m.person_id] || 0) - m.amount;
    } else if (m.type === 'transferencia') {
      balances[m.person_id] = (balances[m.person_id] || 0) - m.amount;
      balances[m.to_person_id] = (balances[m.to_person_id] || 0) + m.amount;
    }
  }
  return balances;
}

async function validateMovement(body) {
  const type = body.type;
  if (!['ingreso', 'egreso', 'transferencia'].includes(type)) {
    return { ok: false, error: 'Tipo de movimiento no válido.' };
  }
  const amount = body.amount;
  if (!Number.isInteger(amount) || amount <= 0) {
    return { ok: false, error: 'El monto debe ser un número mayor que cero.' };
  }
  if (amount > 999999999999) {
    return { ok: false, error: 'El monto es demasiado grande.' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.date || ''))) {
    return { ok: false, error: 'Fecha no válida.' };
  }
  const person = await query(`SELECT 1 FROM ${SC}.persons WHERE id = $1`, [body.personId]);
  if (person.rowCount === 0) {
    return { ok: false, error: 'La persona no existe.' };
  }
  let toPersonId = null;
  if (type === 'transferencia') {
    if (!body.toPersonId) return { ok: false, error: 'Indica la persona de destino.' };
    if (body.toPersonId === body.personId) {
      return { ok: false, error: 'La transferencia debe ser entre personas distintas.' };
    }
    const to = await query(`SELECT 1 FROM ${SC}.persons WHERE id = $1`, [body.toPersonId]);
    if (to.rowCount === 0) return { ok: false, error: 'La persona de destino no existe.' };
    toPersonId = body.toPersonId;
  }
  return {
    ok: true,
    movement: {
      personId: body.personId,
      toPersonId,
      type,
      amount,
      date: body.date,
      note: String(body.note || '').slice(0, 500)
    }
  };
}

const MOVEMENT_COLUMNS = `
  id, person_id AS "personId", to_person_id AS "toPersonId",
  type, amount, date::text AS date, note,
  created_at AS "createdAt", updated_at AS "updatedAt"`;

module.exports = {
  SC,
  query,
  reply,
  wrap,
  createSession,
  destroySession,
  requireAuth,
  getSettings,
  hashPassword,
  validateMovement,
  computeBalances,
  MOVEMENT_COLUMNS
};