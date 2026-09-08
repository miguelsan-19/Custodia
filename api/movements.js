'use strict';

const lib = require('./_lib');

module.exports = lib.wrap(async (req, res) => {
  if (!(await lib.requireAuth(req, res))) return;
  if (req.method !== 'POST') {
    return lib.reply(res, 405, { error: 'Método no permitido.' });
  }

  const v = await lib.validateMovement(req.body || {});
  if (!v.ok) return lib.reply(res, 400, { error: v.error });

  const m = v.movement;
  const ins = await lib.query(
    `INSERT INTO ${lib.SC}.movements (person_id, to_person_id, type, amount, date, note)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${lib.MOVEMENT_COLUMNS}`,
    [m.personId, m.toPersonId, m.type, m.amount, m.date, m.note]
  );
  lib.reply(res, 200, { ok: true, movement: ins.rows[0] });
});