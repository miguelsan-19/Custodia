'use strict';

const lib = require('../_lib');

module.exports = lib.wrap(async (req, res) => {
  if (!(await lib.requireAuth(req, res))) return;
  const id = (req.query && req.query.id) || '';
  if (!id) return lib.reply(res, 400, { error: 'Falta el identificador.' });

  if (req.method === 'PUT' || req.method === 'PATCH') {
    const v = await lib.validateMovement(req.body || {});
    if (!v.ok) return lib.reply(res, 400, { error: v.error });

    const m = v.movement;
    const up = await lib.query(
      `UPDATE ${lib.SC}.movements
       SET person_id = $1, to_person_id = $2, type = $3, amount = $4,
           date = $5, note = $6, updated_at = now()
       WHERE id = $7
       RETURNING ${lib.MOVEMENT_COLUMNS}`,
      [m.personId, m.toPersonId, m.type, m.amount, m.date, m.note, id]
    );
    if (up.rowCount === 0) return lib.reply(res, 404, { error: 'Movimiento no encontrado.' });
    return lib.reply(res, 200, { ok: true, movement: up.rows[0] });
  }

  if (req.method === 'DELETE') {
    const del = await lib.query('DELETE FROM ' + lib.SC + '.movements WHERE id = $1', [id]);
    if (del.rowCount === 0) return lib.reply(res, 404, { error: 'Movimiento no encontrado.' });
    return lib.reply(res, 200, { ok: true });
  }

  lib.reply(res, 405, { error: 'Método no permitido.' });
});