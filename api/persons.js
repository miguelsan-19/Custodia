'use strict';

const lib = require('./_lib');

module.exports = lib.wrap(async (req, res) => {
  if (!(await lib.requireAuth(req, res))) return;
  if (req.method !== 'POST') {
    return lib.reply(res, 405, { error: 'Método no permitido.' });
  }

  const name = String((req.body || {}).name || '').trim();
  if (!name) return lib.reply(res, 400, { error: 'El nombre es obligatorio.' });
  if (name.length > 60) return lib.reply(res, 400, { error: 'El nombre es demasiado largo.' });

  const dup = await lib.query('SELECT 1 FROM ' + lib.SC + '.persons WHERE LOWER(name) = LOWER($1)', [name]);
  if (dup.rowCount > 0) return lib.reply(res, 400, { error: 'Ya existe una persona con ese nombre.' });

  const ins = await lib.query(
    'INSERT INTO ' + lib.SC + '.persons (name) VALUES ($1) RETURNING id, name, created_at AS "createdAt"',
    [name]
  );
  lib.reply(res, 200, { ok: true, person: ins.rows[0] });
});