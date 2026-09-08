'use strict';

const crypto = require('crypto');
const lib = require('./_lib');

module.exports = lib.wrap(async (req, res) => {
  const body = req.body || {};

  const existing = await lib.getSettings();
  if (existing && existing.setup) {
    return lib.reply(res, 400, { error: 'La aplicación ya fue configurada.' });
  }

  const password = String(body.password || '');
  if (password.length < 4) {
    return lib.reply(res, 400, { error: 'La contraseña debe tener al menos 4 caracteres.' });
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = lib.hashPassword(password, salt);
  const currency = String(body.currency || 'S/').trim().slice(0, 8) || 'S/';

  await lib.query(
    `INSERT INTO ${lib.SC}.settings (id, setup, currency, salt, password_hash)
     VALUES (1, true, $1, $2, $3)
     ON CONFLICT (id) DO UPDATE
       SET setup = true, currency = $1, salt = $2, password_hash = $3`,
    [currency, salt, hash]
  );

  const token = await lib.createSession();
  lib.reply(res, 200, { ok: true, token });
});