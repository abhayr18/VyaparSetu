// backend/routes/creditRoutes.js
const express = require('express');
const router = express.Router();
const creditController = require('../controllers/creditController');

router.get('/summary', creditController.getSummary);
router.get('/customers', creditController.getCustomers);
router.get('/customer/:customerId', creditController.getCustomerById);
router.get('/customer/:customerId/transactions', creditController.getTransactions);
router.post('/payment', creditController.collectPayment);
router.post('/adjustment', creditController.adjustCredit);
router.post('/opening-balance', creditController.recordOpeningBalance);

module.exports = router;
