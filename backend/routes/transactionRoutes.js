/**
 * Transaction Routes
 * Endpoints for transaction entry, daily customer purchase history, and bill generation.
 */

const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transactionController');

router.post('/', transactionController.createTransaction);
router.post('/generate-bill', transactionController.generateBill);
router.get('/', transactionController.getAllTransactions);
router.get('/:id', transactionController.getTransactionById);
router.get('/customer/:customerId', transactionController.getCustomerTransactions);
router.get('/customer/:customerId/daily', transactionController.getCustomerDailyPurchase);
router.get('/customer/:customerId/range', transactionController.getCustomerRangeTransactions);
router.delete('/:id', transactionController.deleteTransaction);

module.exports = router;
