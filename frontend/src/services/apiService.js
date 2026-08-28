/**
 * API Service
 * Centralized Axios client for all backend API calls.
 * All HTTP requests in the app should go through this file.
 */

import axios from 'axios';

// ?? (not ||) so the packaged build's explicit empty value is honored as "" — a
// relative base, i.e. /api on the window's own origin, whatever port Express got —
// instead of falling back to :5000. Dev's .env still sets the full localhost URL.
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000';

// Axios instance with defaults
const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ─── Response Interceptor ─────────────────────────────────────────────────────
apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const message =
      error.response?.data?.error?.message ||
      error.message ||
      'An unexpected error occurred';
    return Promise.reject(new Error(message));
  }
);

// ─── Health API ───────────────────────────────────────────────────────────────
export const healthApi = {
  /**
   * GET /api/health
   * @returns {Promise<{ success: boolean, data: object }>}
   */
  getStatus: () => apiClient.get('/api/health'),
};

// ─── License API ──────────────────────────────────────────────────────────────
export const licenseApi = {
  /**
   * GET /api/license/status
   * @returns {Promise<{ success: boolean, data: { activated: boolean, machineId: string, customerName?: string, expiry?: string|null } }>}
   */
  getStatus: () => apiClient.get('/api/license/status'),

  /**
   * POST /api/license/activate
   * @param {string} licenseKey
   */
  activate: (licenseKey) => apiClient.post('/api/license/activate', { licenseKey }),
};

// ─── Customers API ────────────────────────────────────────────────────────────
export const customersApi = {
  /** GET /api/customers */
  getAll: () => apiClient.get('/api/customers'),

  /** GET /api/customers/:id */
  getById: (id) => apiClient.get(`/api/customers/${id}`),

  /** GET /api/customers/search?q= */
  search: (q) => apiClient.get('/api/customers/search', { params: { q } }),

  /** GET /api/customers/:id/ledger */
  getLedger: (id) => apiClient.get(`/api/customers/${id}/ledger`),

  /** POST /api/customers */
  create: (data) => apiClient.post('/api/customers', data),

  /** PUT /api/customers/:id */
  update: (id, data) => apiClient.put(`/api/customers/${id}`, data),

  /** DELETE /api/customers/:id */
  remove: (id) => apiClient.delete(`/api/customers/${id}`),
};

// ─── Vegetables API ───────────────────────────────────────────────────────────
export const vegetablesApi = {
  /** GET /api/vegetables */
  getAll: () => apiClient.get('/api/vegetables'),

  /** GET /api/vegetables/:id */
  getById: (id) => apiClient.get(`/api/vegetables/${id}`),

  /** GET /api/vegetables/search?q= */
  search: (q) => apiClient.get('/api/vegetables/search', { params: { q } }),

  /** POST /api/vegetables */
  create: (data) => apiClient.post('/api/vegetables', data),

  /** PUT /api/vegetables/:id */
  update: (id, data) => apiClient.put(`/api/vegetables/${id}`, data),

  /** DELETE /api/vegetables/:id */
  remove: (id) => apiClient.delete(`/api/vegetables/${id}`),
};

// ─── Bills API ───────────────────────────────────────────────────────────────
export const billsApi = {
  /** GET /api/bills */
  getAll: () => apiClient.get('/api/bills'),

  /** GET /api/bills/:id */
  getById: (id) => apiClient.get(`/api/bills/${id}`),

  /** GET /api/bills/search?q= */
  search: (q) => apiClient.get('/api/bills/search', { params: { q } }),

  /** POST /api/bills */
  create: (data) => apiClient.post('/api/bills', data),

  /** PUT /api/bills/:id */
  update: (id, data) => apiClient.put(`/api/bills/${id}`, data),

  /** DELETE /api/bills/:id */
  remove: (id) => apiClient.delete(`/api/bills/${id}`),
};

// ─── Credit API ──────────────────────────────────────────────────────────────
export const creditApi = {
  getSummary: () => apiClient.get('/api/credit/summary'),
  getCustomers: () => apiClient.get('/api/credit/customers'),
  getCustomerById: (customerId) => apiClient.get(`/api/credit/customer/${customerId}`),
  getTransactions: (customerId) => apiClient.get(`/api/credit/customer/${customerId}/transactions`),
  collectPayment: (data) => apiClient.post('/api/credit/payment', data),
  adjustCredit: (data) => apiClient.post('/api/credit/adjustment', data),
  /** POST /api/credit/opening-balance — for a notebook customer who already existed. */
  recordOpeningBalance: (data) => apiClient.post('/api/credit/opening-balance', data),
};

// ─── Reports API ─────────────────────────────────────────────────────────────
export const reportsApi = {
  getDailySales: (date) => apiClient.get('/api/reports/daily', { params: { date } }),
  getRangeSales: (startDate, endDate) => apiClient.get('/api/reports/sales-range', { params: { startDate, endDate } }),
  getCustomers: (startDate, endDate) => apiClient.get('/api/reports/customers', { params: { startDate, endDate } }),
  getVegetables: (startDate, endDate) => apiClient.get('/api/reports/vegetables', { params: { startDate, endDate } }),
  getCredit: (date) => apiClient.get('/api/reports/credit', { params: { date } }),
  getCommission: (startDate, endDate) => apiClient.get('/api/reports/commission', { params: { startDate, endDate } }),
};

// ─── Backup API ──────────────────────────────────────────────────────────────
export const backupApi = {
  createLocalBackup: () => apiClient.post('/api/backup/local'),
  listBackups: () => apiClient.get('/api/backup/list'),
  restoreBackup: (filename) => apiClient.post('/api/backup/restore', { filename }),
  getLastBackupStatus: () => apiClient.get('/api/backup/status'),
  getInternetStatus: () => apiClient.get('/api/backup/internet-status'),
};

// ─── Dashboard API ───────────────────────────────────────────────────────────
export const dashboardApi = {
  getSummary: () => apiClient.get('/api/dashboard/summary'),
};

// ─── Settings API ────────────────────────────────────────────────────────────
export const settingsApi = {
  getAll: () => apiClient.get('/api/settings'),
  getByKey: (key) => apiClient.get(`/api/settings/${key}`),
  updateByKey: (key, value) => apiClient.put(`/api/settings/${key}`, { value }),
  updateBulk: (settings) => apiClient.put('/api/settings/bulk', settings),
};

// ─── Google Drive API ────────────────────────────────────────────────────────
export const driveApi = {
  getAuthUrl: () => apiClient.get('/api/drive/auth-url'),
  getStatus: () => apiClient.get('/api/drive/status'),
  backup: () => apiClient.post('/api/drive/backup'),
  listBackups: () => apiClient.get('/api/drive/backups'),
  restore: (fileId) => apiClient.post('/api/drive/restore', { fileId }),
  disconnect: () => apiClient.post('/api/drive/disconnect'),
};

// ─── Transaction API ────────────────────────────────────────────────────────
export const transactionApi = {
  create: (data) => apiClient.post('/api/transactions', data),
  generateBill: (data) => apiClient.post('/api/transactions/generate-bill', data),
  generateStatement: (data) => apiClient.post('/api/transactions/generate-statement', data),
  getAll: (params) => apiClient.get('/api/transactions', { params }),

  // Every customer with entries not yet consolidated into a bill, oldest pending day
  // first. Read-only aggregate, no params — it is the whole shop's outstanding work.
  getPendingSettlements: () => apiClient.get('/api/transactions/pending-settlements'),

  getById: (id) => apiClient.get(`/api/transactions/${id}`),
  getByCustomer: (customerId, params) => apiClient.get(`/api/transactions/customer/${customerId}`, { params }),
  getCustomerDaily: (customerId, date) => apiClient.get(`/api/transactions/customer/${customerId}/daily`, { params: { date } }),
  getCustomerRange: (customerId, startDate, endDate) => apiClient.get(`/api/transactions/customer/${customerId}/range`, { params: { startDate, endDate } }),
  remove: (id) => apiClient.delete(`/api/transactions/${id}`),
};

export default apiClient;


