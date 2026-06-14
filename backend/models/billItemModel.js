// backend/models/billItemModel.js
const { getDb, saveDb } = require('../database/db');

// Helper to map rows
function rowToObj(columns, row) {
  const obj = {};
  columns.forEach((col, i) => { obj[col] = row[i]; });
  return obj;
}

function execSelect(sql, params = []) {
  const db = getDb();
  const result = db.exec(sql, params);
  if (!result.length) return [];
  const { columns, values } = result[0];
  return values.map(row => rowToObj(columns, row));
}

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
  const db = getDb();
  for (const it of items) {
    db.run(
      `INSERT INTO bill_items (bill_id, vegetable_id, vegetable_name, quantity, rate, total)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [billId, it.vegetable_id, it.vegetable_name || '', it.quantity, it.rate, it.total]
    );
  }
  return true;
}

function deleteByBillId(billId) {
  const db = getDb();
  db.run(`DELETE FROM bill_items WHERE bill_id = ?`, [billId]);
  return true;
}

module.exports = {
  getByBillId,
  createMany,
  deleteByBillId
};
