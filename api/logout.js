'use strict';

const lib = require('./_lib');

module.exports = lib.wrap(async (req, res) => {
  await lib.destroySession(req);
  lib.reply(res, 200, { ok: true });
});