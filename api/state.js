'use strict';

const lib = require('./_lib');

module.exports = lib.wrap(async (req, res) => {
  if (!(await lib.requireAuth(req, res))) return;

  const [persons, movements, cards, purchases, settings] = await Promise.all([
    lib.query('SELECT id, name, created_at AS "createdAt" FROM ' + lib.SC + '.persons ORDER BY name'),
    lib.query('SELECT ' + lib.MOVEMENT_COLUMNS + ' FROM ' + lib.SC + '.movements ORDER BY date DESC, created_at DESC'),
    lib.query('SELECT ' + lib.CARD_COLUMNS + ' FROM ' + lib.SC + '.cards ORDER BY name'),
    lib.query(
      `SELECT p.id, p.card_id AS "cardId", c.name AS "cardName",
              p.date::text AS date, p.concept, p.amount, p.installments,
              p.paid_installments AS "paidInstallments", p.note,
              p.created_at AS "createdAt", p.updated_at AS "updatedAt"
       FROM ${lib.SC}.card_purchases p
       JOIN ${lib.SC}.cards c ON c.id = p.card_id
       ORDER BY p.date DESC, p.created_at DESC`),
    lib.getSettings()
  ]);

  const balances = await lib.computeBalances();
  const total = Object.values(balances).reduce((a, b) => a + b, 0);

  lib.reply(res, 200, {
    persons: persons.rows,
    movements: movements.rows,
    cards: cards.rows,
    purchases: purchases.rows,
    balances,
    total,
    currency: (settings && settings.currency) || 'S/'
  });
});