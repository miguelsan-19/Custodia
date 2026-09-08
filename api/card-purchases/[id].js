'use strict';

const lib = require('../_lib');

module.exports = lib.wrap(async (req, res) => {
  if (!(await lib.requireAuth(req, res))) return;
  const id = (req.query && req.query.id) || '';
  if (!id) return lib.reply(res, 400, { error: 'Falta el identificador.' });

  if (req.method === 'PUT' || req.method === 'PATCH') {
    const v = await lib.validateCardPurchase(req.body || {});
    if (!v.ok) return lib.reply(res, 400, { error: v.error });

    const p = v.purchase;
    const up = await lib.query(
      `UPDATE ${lib.SC}.card_purchases
       SET card_id = $1, date = $2, concept = $3, amount = $4,
           installments = $5, paid_installments = $6, note = $7, updated_at = now()
       WHERE id = $8
       RETURNING ${lib.PURCHASE_COLUMNS}`,
      [p.cardId, p.date, p.concept, p.amount, p.installments, p.paidInstallments, p.note, id]
    );
    if (up.rowCount === 0) return lib.reply(res, 404, { error: 'Compra no encontrada.' });
    return lib.reply(res, 200, { ok: true, purchase: up.rows[0] });
  }

  if (req.method === 'DELETE') {
    const del = await lib.query('DELETE FROM ' + lib.SC + '.card_purchases WHERE id = $1', [id]);
    if (del.rowCount === 0) return lib.reply(res, 404, { error: 'Compra no encontrada.' });
    return lib.reply(res, 200, { ok: true });
  }

  lib.reply(res, 405, { error: 'Método no permitido.' });
});