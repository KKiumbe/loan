// routes/reportRoutes.js
const express = require('express');
const { getAllActiveCustomersReport, generateGarbageCollectionReport } = require('../../controller/reports/allCustomers.js');
const { downloadInvoice } = require('../../controller/reports/invoicePDFGen.js');
const {getCurrentCustomersDebt, getCustomersWithHighDebt, getCustomersWithLowBalance} = require('../../controller/reports/debtReport.js');
const verifyToken = require('../../middleware/verifyToken.js');
const checkAccess = require('../../middleware/roleVerify.js');
const { generateAgeAnalysisReport } = require('../../controller/reports/ageAnalysisReport.js');
const { generateDormantCustomersReport } = require('../../controller/reports/dormantCustomers.js');
const { generateMonthlyInvoiceReport } = require('../../controller/reports/monthlyInvoiceReport.js');
const { generatePaymentReportPDF, generateMpesaReport, generateReceiptReport, generateIncomeReport } = require('../../controller/reports/payment/paymentReport.js');
const router = express.Router();

// Define the route for the debt report

router.get('/reports/customers',verifyToken, checkAccess("invoices", "read"), getAllActiveCustomersReport); //done

router.get('/reports/dormant',verifyToken, checkAccess("customer", "read"), generateDormantCustomersReport); //done

router.get('/reports/customer-per-collection-day',verifyToken, checkAccess("customer", "read"), generateGarbageCollectionReport); //done

router.get('/reports/monthly-invoice',verifyToken, checkAccess("invoices", "read"), generateMonthlyInvoiceReport); //done

router.get('/reports/age-analysis',verifyToken, checkAccess("invoices", "read"), generateAgeAnalysisReport); //done
router.get('/reports/customers-debt-high',verifyToken, checkAccess("invoices", "read"), getCustomersWithHighDebt);
router.get('/reports/customers-debt-low',verifyToken, checkAccess("invoices", "read"), getCustomersWithLowBalance);



router.get('/download-invoice/:invoiceId',verifyToken, checkAccess("invoices", "read"), downloadInvoice); 





router.get('/reports/payments',verifyToken, checkAccess("payments", "read"), generatePaymentReportPDF); //done


router.get('/reports/mpesa',verifyToken, checkAccess("payments", "read"), generateMpesaReport);

router.get('/reports/receipts',verifyToken, checkAccess("payments", "read"), generateReceiptReport);

router.get('/reports/income',verifyToken, checkAccess("payments", "read"), generateIncomeReport);






  
module.exports = router;
