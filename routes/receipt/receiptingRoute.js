const express = require('express');
const { getReceipts, getReceiptById, searchReceiptsByPhone, searchReceiptsByName } = require('../../controller/receipting/getReceipt.js');
const { MpesaPaymentSettlement } = require('../../controller/receipting/MpesaPaymentSettlement.js');
const { manualCashPayment } = require('../../controller/receipting/manualReceipting.js');
const verifyToken = require('../../middleware/verifyToken.js');

const router = express.Router();

router.post('/manual-receipt',verifyToken, MpesaPaymentSettlement);
router.post('/manual-cash-payment',verifyToken, manualCashPayment);

router.get('/receipts',verifyToken, getReceipts );

router.get('/receipts/:id',verifyToken, getReceiptById);

router.get('/search-by-phone',verifyToken, searchReceiptsByPhone );

router.get('/search-by-name',verifyToken, searchReceiptsByName );



module.exports = router;


