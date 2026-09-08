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

const CARD_COLUMNS = `
  id, name, last4 AS "last4", credit_limit AS "creditLimit", created_at AS "createdAt"`;

const PURCHASE_COLUMNS = `
  id, card_id AS "cardId", date::text AS date, concept, amount,
  installments, paid_installments AS "paidInstallments", note,
  created_at AS "createdAt", updated_at AS "updatedAt"`;

async function validateCard(body) {
  const name = String(body.name || '').trim().slice(0, 60);
  if (!name) return { ok: false, error: 'El nombre de la tarjeta es obligatorio.' };
  const last4 = String(body.last4 || '').trim().replace(/\s+/g, '').slice(0, 4);
  if (!/^\d{0,4}$/.test(last4)) {
    return { ok: false, error: 'Los últimos 4 dígitos deben ser solo números (máx. 4).' };
  }
  let creditLimit = null;
  if (body.creditLimit !== null && body.creditLimit !== undefined && body.creditLimit !== '') {
    const n = Number(body.creditLimit);
    if (!Number.isInteger(n) || n <= 0 || n > 999999999999) {
      return { ok: false, error: 'El límite de crédito no es válido.' };
    }
    creditLimit = n;
  }
  return { ok: true, card: { name, last4, creditLimit } };
}

async function validateCardPurchase(body) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.date || ''))) {
    return { ok: false, error: 'Fecha no válida.' };
  }
  const concept = String(body.concept || '').trim().slice(0, 200);
  if (!concept) return { ok: false, error: 'Describe la compra (concepto).' };
  const amount = body.amount;
  if (!Number.isInteger(amount) || amount <= 0) {
    return { ok: false, error: 'El monto debe ser un número mayor que cero.' };
  }
  if (amount > 999999999999) return { ok: false, error: 'El monto es demasiado grande.' };
  const installments = body.installments;
  if (!Number.isInteger(installments) || installments < 1 || installments > 120) {
    return { ok: false, error: 'El número de cuotas debe estar entre 1 y 120.' };
  }
  const card = await query(`SELECT 1 FROM ${SC}.cards WHERE id = $1`, [body.cardId]);
  if (card.rowCount === 0) return { ok: false, error: 'La tarjeta no existe.' };
  const paid = Number.isInteger(body.paidInstallments) ? body.paidInstallments : 0;
  if (paid < 0 || paid > installments) {
    return { ok: false, error: 'Las cuotas pagadas no son válidas.' };
  }
  return {
    ok: true,
    purchase: {
      cardId: body.cardId,
      date: body.date,
      concept,
      amount,
      installments,
      paidInstallments: paid,
      note: String(body.note || '').slice(0, 300)
    }
  };
}

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
  validateCard,
  validateCardPurchase,
  computeBalances,
  MOVEMENT_COLUMNS,
  CARD_COLUMNS,
  PURCHASE_COLUMNS
};