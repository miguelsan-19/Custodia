'use strict';

const crypto = require('crypto');
const lib = require('./_lib');

module.exports = lib.wrap(async (req, res) => {
  const body = req.body || {};

  const s = await lib.getSettings();
  if (!s || !s.setup) {
    return lib.reply(res, 400, { error: 'Primero configura la aplicación.' });
  }

  const hash = lib.hashPassword(body.password || '', s.salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(s.password_hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return lib.reply(res, 401, { error: 'Contraseña incorrecta.' });
  }

  const token = await lib.createSession();
  lib.reply(res, 200, { ok: true, token });
});