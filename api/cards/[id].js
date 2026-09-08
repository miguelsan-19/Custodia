'use strict';

const lib = require('../_lib');

module.exports = lib.wrap(async (req, res) => {
  if (!(await lib.requireAuth(req, res))) return;
  const id = (req.query && req.query.id) || '';
  if (!id) return lib.reply(res, 400, { error: 'Falta el identificador.' });

  if (req.method === 'PATCH' || req.method === 'PUT') {
    const body = req.body || {};
    const dup = await lib.query(
      'SELECT 1 FROM ' + lib.SC + '.cards WHERE LOWER(name) = LOWER($1) AND id <> $2',
      [String(body.name || ''), id]
    );
    if (dup.rowCount > 0) return lib.reply(res, 400, { error: 'Ya existe una tarjeta con ese nombre.' });

    const v = await lib.validateCard(body);
    if (!v.ok) return lib.reply(res, 400, { error: v.error });

    const c = v.card;
    const up = await lib.query(
      `UPDATE ${lib.SC}.cards SET name = $1, last4 = $2, credit_limit = $3 WHERE id = $4
       RETURNING ${lib.CARD_COLUMNS}`,
      [c.name, c.last4, c.creditLimit, id]
    );
    if (up.rowCount === 0) return lib.reply(res, 404, { error: 'Tarjeta no encontrada.' });
    return lib.reply(res, 200, { ok: true, card: up.rows[0] });
  }

  if (req.method === 'DELETE') {
    const has = await lib.query(
      'SELECT 1 FROM ' + lib.SC + '.card_purchases WHERE card_id = $1 LIMIT 1',
      [id]
    );
    if (has.rowCount > 0) {
      return lib.reply(res, 400, {
        error: 'No se puede eliminar: la tarjeta tiene compras registradas. Elimínalas primero.'
      });
    }
    const del = await lib.query('DELETE FROM ' + lib.SC + '.cards WHERE id = $1', [id]);
    if (del.rowCount === 0) return lib.reply(res, 404, { error: 'Tarjeta no encontrada.' });
    return lib.reply(res, 200, { ok: true });
  }

  lib.reply(res, 405, { error: 'Método no permitido.' });
});