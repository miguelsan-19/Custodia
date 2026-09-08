'use strict';

const lib = require('./_lib');

module.exports = lib.wrap(async (req, res) => {
  const s = await lib.getSettings();
  lib.reply(res, 200, { setup: !!(s && s.setup), currency: (s && s.currency) || 'S/' });
});