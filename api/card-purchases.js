'use strict';

const lib = require('./_lib');

module.exports = lib.wrap(async (req, res) => {
  if (!(await lib.requireAuth(req, res))) return;
  if (req.method !== 'POST') {
    return lib.reply(res, 405, { error: 'Método no permitido.' });
  }

  const v = await lib.validateCardPurchase(req.body || {});
  if (!v.ok) return lib.reply(res, 400, { error: v.error });

  const p = v.purchase;
  const ins = await lib.query(
    `INSERT INTO ${lib.SC}.card_purchases
       (card_id, date, concept, amount, installments, paid_installments, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${lib.PURCHASE_COLUMNS}`,
    [p.cardId, p.date, p.concept, p.amount, p.installments, p.paidInstallments, p.note]
  );
  lib.reply(res, 200, { ok: true, purchase: ins.rows[0] });
});