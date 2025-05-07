const express = require('express');
const { getUnpaidInvoices, attachPaymentToCustomer } = require('../../controller/exception/exceptions.js');
const router = express.Router();


// Get unpaid invoices for a customer
router.get('/invoices/unpaid/:customerId', getUnpaidInvoices);

// Attach a payment to a customer and settle invoices
router.post('/payment/attach/:paymentId/customer/:customerId', attachPaymentToCustomer);

module.exports = router;
