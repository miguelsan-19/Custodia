'use strict';

const lib = require('./_lib');

module.exports = lib.wrap(async (req, res) => {
  if (!(await lib.requireAuth(req, res))) return;
  if (req.method !== 'POST') {
    return lib.reply(res, 405, { error: 'Método no permitido.' });
  }

  const body = req.body || {};
  const dup = await lib.query(
    'SELECT 1 FROM ' + lib.SC + '.cards WHERE LOWER(name) = LOWER($1)',
    [String(body.name || '')]
  );
  if (dup.rowCount > 0) return lib.reply(res, 400, { error: 'Ya existe una tarjeta con ese nombre.' });

  const v = await lib.validateCard(body);
  if (!v.ok) return lib.reply(res, 400, { error: v.error });

  const c = v.card;
  const ins = await lib.query(
    `INSERT INTO ${lib.SC}.cards (name, last4, credit_limit)
     VALUES ($1, $2, $3)
     RETURNING ${lib.CARD_COLUMNS}`,
    [c.name, c.last4, c.creditLimit]
  );
  lib.reply(res, 200, { ok: true, card: ins.rows[0] });
});