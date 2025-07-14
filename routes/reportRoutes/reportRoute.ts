// routes/reportRoutes.js
import express from 'express';
// import { getAllActiveCustomersReport, generateGarbageCollectionReport } from '../../controller/reports/allCustomers.js';
// import { downloadInvoice } from '../../controller/reports/invoicePDFGen.js';
// import { getCurrentCustomersDebt, getCustomersWithHighDebt, getCustomersWithLowBalance } from '../../controller/reports/debtReport.js';
// import verifyToken from '../../middleware/verifyToken.js';
// import checkAccess from '../../middleware/roleVerify.js';
// import { generateAgeAnalysisReport } from '../../controller/reports/ageAnalysisReport.js';
// import { generateDormantCustomersReport } from '../../controller/reports/dormantCustomers.js';
// import { generateMonthlyInvoiceReport } from '../../controller/reports/monthlyInvoiceReport.js';
// import { generatePaymentReportPDF, generateMpesaReport, generateReceiptReport, generateIncomeReport } from '../../controller/reports/payment/paymentReport.js';
const router = express.Router();

// Define the route for the debt report

// router.get('/reports/customers',verifyToken, checkAccess("invoices", "read"), getAllActiveCustomersReport); //done

// router.get('/reports/dormant',verifyToken, checkAccess("customer", "read"), generateDormantCustomersReport); //done

// router.get('/reports/customer-per-collection-day',verifyToken, checkAccess("customer", "read"), generateGarbageCollectionReport); //done

// router.get('/reports/monthly-invoice',verifyToken, checkAccess("invoices", "read"), generateMonthlyInvoiceReport); //done

// router.get('/reports/age-analysis',verifyToken, checkAccess("invoices", "read"), generateAgeAnalysisReport); //done
// router.get('/reports/customers-debt-high',verifyToken, checkAccess("invoices", "read"), getCustomersWithHighDebt);
// router.get('/reports/customers-debt-low',verifyToken, checkAccess("invoices", "read"), getCustomersWithLowBalance);



// router.get('/download-invoice/:invoiceId',verifyToken, checkAccess("invoices", "read"), downloadInvoice); 





// router.get('/reports/payments',verifyToken, checkAccess("payments", "read"), generatePaymentReportPDF); //done


// router.get('/reports/mpesa',verifyToken, checkAccess("payments", "read"), generateMpesaReport);

// router.get('/reports/receipts',verifyToken, checkAccess("payments", "read"), generateReceiptReport);

// router.get('/reports/income',verifyToken, checkAccess("payments", "read"), generateIncomeReport);






  
export default router;