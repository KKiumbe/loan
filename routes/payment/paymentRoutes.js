const express = require('express');
const { fetchAllPayments, fetchPaymentById, fetchPaymentsByTransactionId, getAllPayments, searchPaymentsByName, searchPaymentsByPhone, getUnreceiptedPayments, searchTransactionById, filterPaymentsByMode } = require('../../controller/payments/getAllPayments.js');
const verifyToken = require('../../middleware/verifyToken.js');
const checkAccess = require('../../middleware/roleVerify.js');

const router = express.Router();


router.get('/payments',verifyToken,checkAccess('payments','read'), getAllPayments);
router.get('/payments/unreceipted',verifyToken,checkAccess('payments','read'), getUnreceiptedPayments);
router.get('/payments/search-by-name',verifyToken,checkAccess('payments','read'), searchPaymentsByName);
router.get('/payments/search-by-phone',verifyToken,checkAccess('payments','read'), searchPaymentsByPhone);

router.get('/searchTransactionById', verifyToken, searchTransactionById);
router.get('/filterPaymentsByMode',verifyToken, filterPaymentsByMode);
router.get('/payments/:paymentId', verifyToken,checkAccess('payments','read'), fetchPaymentById);
router.get('/payments-search', verifyToken, checkAccess('payments','read'), fetchPaymentsByTransactionId);


module.exports = router;