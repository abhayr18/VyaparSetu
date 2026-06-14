/**
 * Customer Controller
 * Thin HTTP layer — parses request, calls service, returns JSON response.
 * No business logic or SQL here.
 */

const customerService = require('../services/customerService');

/**
 * GET /api/customers
 */
function getAll(req, res, next) {
  try {
    const customers = customerService.getAllCustomers();
    res.json({ success: true, data: customers, count: customers.length });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/customers/search?q=
 * NOTE: This route must be mounted BEFORE /:id to avoid "search" being treated as an id.
 */
function searchCustomers(req, res, next) {
  try {
    const { q = '' } = req.query;
    const customers = customerService.searchCustomers(q);
    res.json({ success: true, data: customers, count: customers.length });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/customers/:id
 */
function getById(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid customer ID.' });
    }
    const customer = customerService.getCustomerById(id);
    res.json({ success: true, data: customer });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/customers
 */
function create(req, res, next) {
  try {
    const { name, mobile, address, notes } = req.body;
    const customer = customerService.createCustomer({ name, mobile, address, notes });
    res.status(201).json({ success: true, data: customer, message: 'Customer created successfully.' });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/customers/:id
 */
function update(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid customer ID.' });
    }
    const { name, mobile, address, notes } = req.body;
    const customer = customerService.updateCustomer(id, { name, mobile, address, notes });
    res.json({ success: true, data: customer, message: 'Customer updated successfully.' });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/customers/:id
 */
function remove(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid customer ID.' });
    }
    customerService.deleteCustomer(id);
    res.json({ success: true, message: 'Customer deleted successfully.' });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/customers/:id/ledger
 */
function getLedger(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid customer ID.' });
    }
    const ledger = customerService.getCustomerLedger(id);
    if (!ledger) return res.status(404).json({ success: false, message: 'Customer not found.' });
    res.json({ success: true, data: ledger });
  } catch (err) {
    next(err);
  }
}

module.exports = { getAll, getById, searchCustomers, create, update, remove, getLedger };
