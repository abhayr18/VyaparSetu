/**
 * Vegetable Model
 * All SQL queries for the vegetables table.
 * Services call these — no direct DB access from controllers.
 *
 * Search strategy:
 *   - name LIKE '%q%'            → direct name match
 *   - search_keywords LIKE '%q%' → keyword alias match
 *   Both are OR'd so partial typing like "shev" hits शेवगा
 *   and any keyword containing "shev".
 */

const { execSelect, execRun } = require('../database/db');
const { toPaise, rowToRupees } = require('../utils/money');

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Get all vegetables ordered by name.
 */
function findAll() {
  return execSelect(
    `SELECT id, name, rate, unit, search_keywords, notes, created_at, updated_at
     FROM vegetables
     WHERE is_deleted = 0
     ORDER BY name ASC`
  ).map((v) => rowToRupees(v, 'vegetables'));
}

/**
 * Find a single vegetable by ID.
 */
function findById(id) {
  const rows = execSelect(
    `SELECT id, name, rate, unit, search_keywords, notes, created_at, updated_at
     FROM vegetables WHERE id = ?`,
    [id]
  );
  return rowToRupees(rows[0] || null, 'vegetables');
}

/**
 * Find by name — used for duplicate check (case-insensitive).
 * @param {string} name
 * @param {number|null} excludeId
 */
function findByName(name, excludeId = null) {
  const sql = excludeId
    ? `SELECT id FROM vegetables WHERE LOWER(name) = LOWER(?) AND id != ? AND is_deleted = 0`
    : `SELECT id FROM vegetables WHERE LOWER(name) = LOWER(?) AND is_deleted = 0`;
  const params = excludeId ? [name.trim(), excludeId] : [name.trim()];
  const rows = execSelect(sql, params);
  return rows[0] || null;
}

/**
 * Smart search — matches name OR search_keywords using LIKE.
 * Partial match: "shev" → शेवगा (if keyword contains "shev")
 * Structure is ready for fuzzy/FTS upgrade later.
 * @param {string} query
 */
function search(query) {
  const like = `%${query.trim()}%`;
  return execSelect(
    `SELECT id, name, rate, unit, search_keywords, notes, created_at, updated_at
     FROM vegetables
     WHERE (name LIKE ? OR search_keywords LIKE ?) AND is_deleted = 0
     ORDER BY
       CASE WHEN name LIKE ? THEN 0 ELSE 1 END,
       name ASC`,
    [like, like, like]
  ).map((v) => rowToRupees(v, 'vegetables'));
}

/**
 * Insert a new vegetable or reactivate a deleted one.
 */
function create({ name, rate, unit = 'kg', search_keywords = '', notes = '' }) {
  // Check if a record already exists with this name (even if deleted)
  const rows = execSelect(`SELECT id FROM vegetables WHERE LOWER(name) = LOWER(?)`, [name.trim()]);

  if (rows.length > 0) {
    // Reactivate and update existing soft-deleted record
    const existingId = rows[0].id;
    execRun(
      `UPDATE vegetables
       SET rate = ?, unit = ?, search_keywords = ?, notes = ?, is_deleted = 0, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [toPaise(rate), unit.trim(), search_keywords.trim(), notes.trim(), existingId]
    );
  } else {
    // Insert fresh record
    execRun(
      `INSERT INTO vegetables (name, rate, unit, search_keywords, notes)
       VALUES (?, ?, ?, ?, ?)`,
      [name.trim(), toPaise(rate), unit.trim(), search_keywords.trim(), notes.trim()]
    );
  }

  const resultRows = execSelect(
    `SELECT id, name, rate, unit, search_keywords, notes, created_at, updated_at
     FROM vegetables WHERE LOWER(name) = LOWER(?)`,
    [name.trim()]
  );
  return rowToRupees(resultRows[0], 'vegetables');
}

/**
 * Update an existing vegetable.
 */
function update(id, { name, rate, unit = 'kg', search_keywords = '', notes = '' }) {
  execRun(
    `UPDATE vegetables
     SET name = ?, rate = ?, unit = ?, search_keywords = ?, notes = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [name.trim(), toPaise(rate), unit.trim(), search_keywords.trim(), notes.trim(), id]
  );
  return findById(id);
}

/**
 * Delete a vegetable by ID.
 */
function remove(id) {
  const existing = findById(id);
  if (!existing) return false;
  execRun(`UPDATE vegetables SET is_deleted = 1 WHERE id = ?`, [id]);
  return true;
}

module.exports = { findAll, findById, findByName, search, create, update, remove };
