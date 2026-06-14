/**
 * Customer Service
 * Business logic layer for customer management.
 * Validates inputs and coordinates with the model.
 * Controllers call services — never the model directly.
 */

const customerModel = require('../models/customerModel');

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validates customer input fields.
 * @param {{ name, mobile }} data
 * @param {number|null} excludeId - skip this ID for mobile uniqueness check (edit case)
 * @throws {Error} with statusCode 400 if validation fails
 */
function validate({ name, mobile }, excludeId = null) {
  const errors = [];

  if (!name || !name.trim()) {
    errors.push('Customer name is required.');
  }

  if (!mobile || !mobile.trim()) {
    errors.push('Mobile number is required.');
  } else if (!/^\d{10}$/.test(mobile.trim())) {
    errors.push('Mobile number must be exactly 10 digits.');
  } else {
    const existing = customerModel.findByMobile(mobile.trim(), excludeId);
    if (existing) {
      errors.push(`Mobile number ${mobile.trim()} is already registered.`);
    }
  }

  if (errors.length > 0) {
    const err = new Error(errors.join(' '));
    err.statusCode = 400;
    err.errors = errors;
    throw err;
  }
}

// ─── Service Methods ──────────────────────────────────────────────────────────

/**
 * Get all customers.
 * @returns {Array}
 */
function getAllCustomers() {
  return customerModel.findAll();
}

/**
 * Get a single customer by ID.
 * @param {number} id
 * @returns {Object}
 * @throws {Error} 404 if not found
 */
function getCustomerById(id) {
  const customer = customerModel.findById(id);
  if (!customer) {
    const err = new Error(`Customer with ID ${id} not found.`);
    err.statusCode = 404;
    throw err;
  }
  return customer;
}

/**
 * Search customers by name or mobile.
 * @param {string} query
 * @returns {Array}
 */
function searchCustomers(query) {
  if (!query || !query.trim()) return customerModel.findAll();
  return customerModel.search(query.trim());
}

/**
 * Create a new customer.
 * @param {{ name, mobile, address, notes }} data
 * @returns {Object} Created customer
 */
function createCustomer(data) {
  validate(data);
  return customerModel.create(data);
}

/**
 * Update an existing customer.
 * @param {number} id
 * @param {{ name, mobile, address, notes }} data
 * @returns {Object} Updated customer
 */
function updateCustomer(id, data) {
  // Ensure customer exists first
  getCustomerById(id);
  // Validate, excluding current customer's mobile from duplicate check
  validate(data, id);
  return customerModel.update(id, data);
}

/**
 * Delete a customer.
 * @param {number} id
 * @returns {boolean}
 */
function deleteCustomer(id) {
  const customer = getCustomerById(id); // throws 404 if not found
  if (Number(customer.credit_balance || 0) > 0) {
    const err = new Error('Cannot delete customer with pending credit balance.');
    err.statusCode = 400;
    throw err;
  }
  return customerModel.remove(id);
}

/**
 * Get the full ledger for a customer.
 * @param {number} id
 * @returns {Object|null}
 */
function getCustomerLedger(id) {
  return customerModel.getLedger(id);
}

module.exports = {
  getAllCustomers,
  getCustomerById,
  searchCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getCustomerLedger,
};

