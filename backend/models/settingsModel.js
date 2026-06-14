/**
 * Settings Model
 * Placeholder for settings CRUD operations.
 * Will be expanded in the Settings module.
 * Uses sql.js API (exec / run with params array).
 */

const { getDb, saveDb } = require('../database/db');

/**
 * Get a setting value by key.
 * @param {string} key
 * @returns {string|null}
 */
function getSetting(key) {
  const db = getDb();
  const result = db.exec('SELECT value FROM settings WHERE key = ?', [key]);
  if (result.length > 0 && result[0].values.length > 0) {
    return result[0].values[0][0];
  }
  return null;
}

/**
 * Set a setting value by key.
 * @param {string} key
 * @param {string} value
 */
function setSetting(key, value) {
  const db = getDb();
  db.run(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
    [key, value]
  );
  saveDb();
}

module.exports = { getSetting, setSetting };
