// const express = require('express');

// const { getAllInvoices, generateInvoices, cancelInvoiceById, createInvoice, getInvoiceDetails, generateInvoicesByDay, generateInvoicesPerTenant, generateInvoicesForAll, cancelCustomerInvoice, invoiceCreate, createInitialInvoice } = require('../../controller/bill/billGenerator.js');
// const { SearchInvoices, searchInvoicesByPhone, searchInvoicesByName } = require('../../controller/bill/searchInvoice.js');
// const { addSmsJob } = require('../../controller/bulkSMS/sendSMSJob.js');
// const { cancelSystemGenInvoices } = require('../../controller/bill/cancelJob.js');
// const verifyToken = require('../../middleware/verifyToken.js');

// const router = express.Router();




// router.get('/invoices/all',verifyToken, getAllInvoices );
// router.patch('/invoice/cancel/:id/', verifyToken, cancelCustomerInvoice );

// router.get('/invoices/search-by-phone',verifyToken, searchInvoicesByPhone);

// router.get('/invoices/search-by-name',verifyToken, searchInvoicesByName);
// router.get('/invoices/:id/',verifyToken, getInvoiceDetails);
// router.put('/invoices/cancel/:invoiceId/', verifyToken, cancelInvoiceById);

// // Route to create a manual invoice

// //router.post('/invoices', verifyToken,createInvoice);

// router.post('/create-invoice', verifyToken,createInvoice);
// router.post('/customer-onboarding-invoice', verifyToken,createInitialInvoice);


// router.post('/send-bulk-sms', addSmsJob);


// // Route to generate invoices for all active customers for a specified month
// router.post('/invoices/generate', verifyToken,generateInvoices);

// router.post('/invoices-generate-day',generateInvoicesByDay)


// router.post('/invoices-generate-tenant',generateInvoicesPerTenant)


// router.post('/generate-invoices-for-all',verifyToken, generateInvoicesForAll)



// // Route to cancel system-generated invoices for a specific customer and month
// router.patch('/invoices/cancel',verifyToken, cancelSystemGenInvoices);


// module.exports = router;
