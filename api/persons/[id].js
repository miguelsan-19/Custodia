'use strict';

const lib = require('../_lib');

module.exports = lib.wrap(async (req, res) => {
  if (!(await lib.requireAuth(req, res))) return;
  const id = (req.query && req.query.id) || '';
  if (!id) return lib.reply(res, 400, { error: 'Falta el identificador.' });

  if (req.method === 'PATCH' || req.method === 'PUT') {
    const name = String((req.body || {}).name || '').trim();
    if (!name) return lib.reply(res, 400, { error: 'El nombre es obligatorio.' });

    const dup = await lib.query(
      'SELECT 1 FROM ' + lib.SC + '.persons WHERE LOWER(name) = LOWER($1) AND id <> $2',
      [name, id]
    );
    if (dup.rowCount > 0) return lib.reply(res, 400, { error: 'Ya existe una persona con ese nombre.' });

    const up = await lib.query('UPDATE ' + lib.SC + '.persons SET name = $1 WHERE id = $2', [name.slice(0, 60), id]);
    if (up.rowCount === 0) return lib.reply(res, 404, { error: 'Persona no encontrada.' });
    return lib.reply(res, 200, { ok: true });
  }

  if (req.method === 'DELETE') {
    const has = await lib.query(
      'SELECT 1 FROM ' + lib.SC + '.movements WHERE person_id = $1 OR to_person_id = $1 LIMIT 1',
      [id]
    );
    if (has.rowCount > 0) {
      return lib.reply(res, 400, {
        error: 'No se puede eliminar: la persona tiene movimientos. Elimínalos primero.'
      });
    }
    const del = await lib.query('DELETE FROM ' + lib.SC + '.persons WHERE id = $1', [id]);
    if (del.rowCount === 0) return lib.reply(res, 404, { error: 'Persona no encontrada.' });
    return lib.reply(res, 200, { ok: true });
  }

  lib.reply(res, 405, { error: 'Método no permitido.' });
});