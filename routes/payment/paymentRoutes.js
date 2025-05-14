const express = require('express');
const {  getAllLoanPayouts, makeOrganizationPayment, getPaymentConfirmations, getPaymentBatches } = require('../../controller/payments/getAllPayments.js');
const verifyToken = require('../../middleware/verifyToken.js');
const checkAccess = require('../../middleware/roleVerify.js');

const router = express.Router();


router.get('/loan-payouts', verifyToken, getAllLoanPayouts);

//create organization payment 
router.post('/create-payment', verifyToken, checkAccess('payment', 'create'), makeOrganizationPayment);

router.get('/payment-confirmations', verifyToken, checkAccess('payment', 'read'), getPaymentConfirmations );

router.get(
  '/payment-batches',
  verifyToken,
  checkAccess('payment', 'read'),
  getPaymentBatches
);

module.exports = router;