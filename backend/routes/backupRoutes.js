const express = require('express');
const router = express.Router();
const backupController = require('../controllers/backupController');

router.post('/local', backupController.createLocalBackup);
router.get('/list', backupController.listBackups);
router.post('/restore', backupController.restoreBackup);
router.get('/status', backupController.getBackupStatus);
router.get('/internet-status', backupController.checkInternetStatus);

module.exports = router;
