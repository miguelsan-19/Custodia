'use strict';

const lib = require('./_lib');

module.exports = lib.wrap(async (req, res) => {
  if (!(await lib.requireAuth(req, res))) return;

  const [persons, movements, settings] = await Promise.all([
    lib.query('SELECT id, name, created_at AS "createdAt" FROM ' + lib.SC + '.persons ORDER BY name'),
    lib.query('SELECT ' + lib.MOVEMENT_COLUMNS + ' FROM ' + lib.SC + '.movements ORDER BY date DESC, created_at DESC'),
    lib.getSettings()
  ]);

  const balances = await lib.computeBalances();
  const total = Object.values(balances).reduce((a, b) => a + b, 0);

  lib.reply(res, 200, {
    persons: persons.rows,
    movements: movements.rows,
    balances,
    total,
    currency: (settings && settings.currency) || 'S/'
  });
});