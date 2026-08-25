// backend/models/billItemModel.js
const { execSelect, execRun } = require('../database/db');

function getByBillId(billId) {
  return execSelect(
    `SELECT bi.*, v.unit AS vegetable_unit
     FROM bill_items bi
     LEFT JOIN vegetables v ON bi.vegetable_id = v.id
     WHERE bi.bill_id = ?`,
    [billId]
  );
}

function createMany(billId, items) {
  for (const it of items) {
    execRun(
      `INSERT INTO bill_items (bill_id, vegetable_id, vegetable_name, quantity, rate, total)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [billId, it.vegetable_id, it.vegetable_name || '', it.quantity, it.rate, it.total]
    );
  }
  return true;
}

function deleteByBillId(billId) {
  execRun(`DELETE FROM bill_items WHERE bill_id = ?`, [billId]);
  return true;
}

module.exports = {
  getByBillId,
  createMany,
  deleteByBillId
};
