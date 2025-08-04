// const { PrismaClient } = require('@prisma/client');
// const PDFDocument = require('pdfkit');
// const fetchTenant = require('../fetchteant');
// const { generatePDFHeader } = require('../header');


// const prisma = new PrismaClient();




// async function generateIncomeReport(req, res) {
//   try {
//       const tenantId = req.user?.tenantId;
//       if (!tenantId) throw new Error("Tenant ID is required");

//       const tenant = await fetchTenant(tenantId);
//       if (!tenant) return res.status(404).json({ message: "Tenant not found" });

//       const doc = new PDFDocument({ margin: 50 });
//       res.setHeader('Content-Type', 'application/pdf');
//       res.setHeader('Content-Disposition', 'attachment; filename="income-report.pdf"');
//       doc.pipe(res);

//       // Add header
//       generatePDFHeader(doc, tenant);

//       doc.fontSize(14).text('Income Report: Invoices vs Payments (by Month)', { align: 'center' }).moveDown();

//       // Fetch invoices grouped by month (based on creation date)
//       const invoices = await prisma.invoice.groupBy({
//           by: ['createdAt'],
//           where: { tenantId },
//           _sum: { invoiceAmount: true },
//           orderBy: { createdAt: 'asc' }
//       });

//       // Fetch payments grouped by month (based on creation date)
//       const payments = await prisma.payment.groupBy({
//           by: ['createdAt'],
//           where: { tenantId },
//           _sum: { amount: true },
//           orderBy: { createdAt: 'asc' }
//       });

//       // Organize data by month
//       const monthlyData = {};
      
//       invoices.forEach(inv => {
//           const month = inv.createdAt.toISOString().slice(0, 7); // Format as YYYY-MM
//           if (!monthlyData[month]) {
//               monthlyData[month] = { invoiced: 0, payments: 0 };
//           }
//           monthlyData[month].invoiced = inv._sum.invoiceAmount || 0;
//       });

//       payments.forEach(pay => {
//           const month = pay.createdAt.toISOString().slice(0, 7);
//           if (!monthlyData[month]) {
//               monthlyData[month] = { invoiced: 0, payments: 0 };
//           }
//           monthlyData[month].payments = pay._sum.amount || 0;
//       });

//       // Define table headers
//       const headers = ['Month', 'Total Invoiced', 'Total Payments', 'Percentage Paid (%)'];
//       const columnWidths = [80, 100, 100, 120];

//       // Draw headers
//       let startX = 50;
//       let startY = doc.y + 20;
//       doc.font('Helvetica-Bold').fontSize(10);
//       headers.forEach((header, index) => {
//           doc.text(header, startX + columnWidths.slice(0, index).reduce((a, b) => a + b, 0), startY, { width: columnWidths[index], align: 'left' });
//       });

//       // Draw underline
//       startY += 20;
//       doc.moveTo(50, startY).lineTo(580, startY).stroke();

//       // Draw table rows
//       doc.font('Helvetica').fontSize(9);
//       Object.entries(monthlyData).forEach(([month, data]) => {
//           startY += 20;
//           const percentagePaid = data.invoiced > 0 ? ((data.payments / data.invoiced) * 100).toFixed(2) : '0.00';

//           const rowData = [
//               month,
//               `Ksh ${data.invoiced.toFixed(2)}`,
//               `Ksh ${data.payments.toFixed(2)}`,
//               `${percentagePaid}%`
//           ];

//           rowData.forEach((text, index) => {
//               doc.text(text, startX + columnWidths.slice(0, index).reduce((a, b) => a + b, 0), startY, { width: columnWidths[index], align: 'left' });
//           });

//           // Draw row separator
//           startY += 10;
//           doc.moveTo(50, startY).lineTo(580, startY).stroke();
//       });

//       doc.end();
//   } catch (error) {
//       console.error('Error generating income report:', error);
//       res.status(500).json({ error: 'Failed to generate PDF report' });
//   }
// }



// async function generatePaymentReportPDF(req, res) {
//   try {
//     // Validate and get tenant information
//     const tenantId = req.user?.tenantId;
//     if (!tenantId) throw new Error("Tenant ID is required");

//     const tenant = await fetchTenant(tenantId);
//     if (!tenant) return res.status(404).json({ message: "Tenant not found" });

//     // Get first and last day of the current month
//     const now = new Date();
//     const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
//     const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

//     // Fetch payment data for the current month
//     const payments = await prisma.payment.findMany({
//       where: {
//         tenantId,
//         createdAt: {
//           gte: firstDayOfMonth, // Greater than or equal to first day of the month
//           lte: lastDayOfMonth,  // Less than or equal to last day of the month
//         },
//       },
//       select: {
//         amount: true,
//         modeOfPayment: true,
//         receipted: true,
//         transactionId: true,
//         ref: true,
//         receiptId: true,
//         createdAt: true,
//         receipt: {
//           select: {
//             customer: {
//               select: {
//                 firstName: true
//               }
//             }
//           }
//         }
//       },
//       orderBy: { createdAt: 'desc' }
//     });

//     // Create PDF document
//     const doc = new PDFDocument({ margin: 50 });
//     res.setHeader('Content-Type', 'application/pdf');
//     res.setHeader('Content-Disposition', 'attachment; filename="payment-report.pdf"');
//     doc.pipe(res);

//     // Add header
//     generatePDFHeader(doc, tenant);

//     // Report title
//     doc.fontSize(14).text('Payment Details Report', { align: 'center' }).moveDown(1);
//     doc.fontSize(12).text(`Period: ${firstDayOfMonth.toDateString()} - ${lastDayOfMonth.toDateString()}`, { align: 'center' }).moveDown(1);

//     // Handle empty data
//     if (payments.length === 0) {
//       doc.font('Helvetica').fontSize(12).text('No payment records found for this month.', 50, doc.y + 20);
//       doc.end();
//       return;
//     }

//     // Table configuration
//     const tableHeaders = ['Date', 'First Name', 'Amount', 'Method', 'Receipted', 'Transaction ID', 'Reference', 'Receipt ID'];
//     const columnWidths = [70, 80, 60, 70, 60, 110, 80, 110];
//     let startX = 50;
//     let startY = doc.y + 20;

//     // Draw table headers
//     doc.font('Helvetica-Bold').fontSize(9);
//     tableHeaders.forEach((header, index) => {
//       doc.text(header, startX + columnWidths.slice(0, index).reduce((a, b) => a + b, 0), startY, {
//         width: columnWidths[index],
//         align: 'left'
//       });
//     });

//     // Draw header underline
//     startY += 20;
//     doc.moveTo(50, startY).lineTo(580, startY).stroke();

//     // Draw table rows
//     doc.font('Helvetica').fontSize(9);
//     payments.forEach(payment => {
//       startY += 20;

//       const rowData = [
//         payment.createdAt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
//         payment.receipt?.customer?.firstName || 'N/A',
//         `Ksh ${payment.amount.toFixed(2)}`,
//         payment.modeOfPayment,
//         payment.receipted ? 'Yes' : 'No',
//         payment.transactionId || 'N/A',
//         payment.ref || 'N/A',
//         payment.receiptId || 'N/A'
//       ];

//       rowData.forEach((text, index) => {
//         doc.text(text,
//           startX + columnWidths.slice(0, index).reduce((a, b) => a + b, 0),
//           startY,
//           { width: columnWidths[index], align: 'left' }
//         );
//       });

//       // Draw row separator
//       startY += 10;
//       doc.moveTo(50, startY).lineTo(580, startY).stroke();
//     });

//     // Add total summary
//     startY += 30;
//     const totalAmount = payments.reduce((sum, payment) => sum + payment.amount, 0);
//     doc.font('Helvetica-Bold').fontSize(10)
//        .text(`Total Amount: Ksh ${totalAmount.toFixed(2)}`, 50, startY);

//     doc.end();
//   } catch (error) {
//     console.error('Error generating PDF report:', error);
//     const statusCode = error.message === "Tenant ID is required" ? 403 : 500;
//     res.status(statusCode).json({ error: error.message || 'Failed to generate PDF report' });
//   }
// }




// async function generateMpesaReport(req, res) {
//   try {
//     // Validate and get tenant information
//     const tenantId = req.user?.tenantId;
//     if (!tenantId) throw new Error("Tenant ID is required");

//     const tenant = await fetchTenant(tenantId);
//     if (!tenant) return res.status(404).json({ message: "Tenant not found" });

//     // Get first and last day of current month
//     const now = new Date();
//     const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
//     const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

//     // Fetch payment data for the current month
//     const payments = await prisma.mPESATransactions.findMany({
//       where: {
//         tenantId,
//         createdAt: {
//           gte: firstDayOfMonth, // Greater than or equal to first day of the month
//           lte: lastDayOfMonth,  // Less than or equal to last day of the month
//         },
//       },
//       select: {
//         TransID: true,
//         TransTime: true,
//         TransAmount: true,
//         BillRefNumber: true,
//         FirstName: true,
//         processed: true,
//         createdAt: true,
//       },
//       orderBy: { createdAt: 'desc' }
//     });

//     // Create PDF document
//     const doc = new PDFDocument({ margin: 50 });
//     res.setHeader('Content-Type', 'application/pdf');
//     res.setHeader('Content-Disposition', 'attachment; filename="Mpesa-report.pdf"');
//     doc.pipe(res);

//     // Add header
//     generatePDFHeader(doc, tenant);

//     // Report title
//     doc.fontSize(14).text('M-Pesa Transactions Report', { align: 'center' }).moveDown(1);
//     doc.fontSize(12).text(`Period: ${firstDayOfMonth.toDateString()} - ${lastDayOfMonth.toDateString()}`, { align: 'center' }).moveDown(1);

//     // Handle empty data
//     if (payments.length === 0) {
//       doc.font('Helvetica').fontSize(12).text('No payment records found for this month.', 50, doc.y + 20);
//       doc.end();
//       return;
//     }

//     // Table configuration
//     const tableHeaders = ['TransID', 'Date', 'Amount', 'BillRefNumber', 'First Name', 'Processed'];
//     const columnWidths = [70, 80, 60, 100, 110, 70];
//     let startX = 50;
//     let startY = doc.y + 20;

//     // Draw table headers
//     doc.font('Helvetica-Bold').fontSize(9);
//     tableHeaders.forEach((header, index) => {
//       doc.text(header, startX + columnWidths.slice(0, index).reduce((a, b) => a + b, 0), startY, {
//         width: columnWidths[index],
//         align: 'left'
//       });
//     });

//     // Draw header underline
//     startY += 20;
//     doc.moveTo(50, startY).lineTo(580, startY).stroke();

//     // Draw table rows
//     doc.font('Helvetica').fontSize(9);
//     payments.forEach(payment => {
//       startY += 20;

//       const rowData = [
//         payment.TransID || 'N/A',
//         payment.createdAt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
//         `Ksh ${payment.TransAmount.toFixed(2)}`,
//         payment.BillRefNumber || 'N/A',
//         payment.FirstName || 'N/A',
//         payment.processed ? 'Yes' : 'No',
//       ];

//       rowData.forEach((text, index) => {
//         doc.text(text,
//           startX + columnWidths.slice(0, index).reduce((a, b) => a + b, 0),
//           startY,
//           { width: columnWidths[index], align: 'left' }
//         );
//       });

//       // Draw row separator
//       startY += 10;
//       doc.moveTo(50, startY).lineTo(580, startY).stroke();
//     });

//     // Add total summary
//     startY += 30;
//     const totalAmount = payments.reduce((sum, payment) => sum + payment.TransAmount, 0);
//     doc.font('Helvetica-Bold').fontSize(10)
//        .text(`Total Amount: Ksh ${totalAmount.toFixed(2)}`, 50, startY);

//     doc.end();
//   } catch (error) {
//     console.error('Error generating M-Pesa report:', error);
//     res.status(500).json({ error: 'Failed to generate report' });
//   }
// }


// async function generateReceiptReport(req, res) {
//   try {
//     // Validate and get tenant information
//     const tenantId = req.user?.tenantId;
//     if (!tenantId) throw new Error("Tenant ID is required");

//     const tenant = await fetchTenant(tenantId);
//     if (!tenant) return res.status(404).json({ message: "Tenant not found" });

//     // Create PDF document
//     const doc = new PDFDocument({ margin: 50 });
//     res.setHeader('Content-Type', 'application/pdf');
//     res.setHeader('Content-Disposition', 'attachment; filename="receipt-report.pdf"');
//     doc.pipe(res);

//     // Add header
//     generatePDFHeader(doc, tenant);

//     // Report title
//     doc.fontSize(14)
//        .text('Receipt Report', { align: 'center' })
//        .moveDown(1);

//     // Table configuration
//     const tableHeaders = [
//       'Date',
//       'Receipt No',
//       'Amount',
//       'Mode',
//       'Paid By',
//       'Transaction Code',
//       'Phone Number'
//     ];
//     const columnWidths = [70, 100, 80, 80, 100, 100, 100];
//     let startX = 50;
//     let startY = doc.y;

//     // Draw table headers
//     doc.font('Helvetica-Bold').fontSize(9);
//     tableHeaders.forEach((header, index) => {
//       doc.text(header, startX + columnWidths.slice(0, index).reduce((a, b) => a + b, 0), startY, {
//         width: columnWidths[index],
//         align: 'left'
//       });
//     });

//     // Draw header underline
//     startY += 20;
//     doc.moveTo(50, startY).lineTo(580, startY).stroke();

//     // Fetch receipt data
//     const receipts = await prisma.receipt.findMany({
//       where: { tenantId },
//       select: {
//         createdAt: true,
//         receiptNumber: true,
//         amount: true,
//         modeOfPayment: true,
//         paidBy: true,
//         transactionCode: true,
//         phoneNumber: true
//       },
//       orderBy: { createdAt: 'desc' }
//     });

//     // Handle empty data
//     if (receipts.length === 0) {
//       doc.font('Helvetica').fontSize(12)
//          .text('No receipt records found', 50, startY + 20);
//       doc.end();
//       return;
//     }

//     // Draw table rows
//     doc.font('Helvetica').fontSize(9);
//     receipts.forEach(receipt => {
//       startY += 20;
//       const rowData = [
//         receipt.createdAt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
//         receipt.receiptNumber,
//         `Ksh ${receipt.amount.toFixed(2)}`,
//         receipt.modeOfPayment,
//         receipt.paidBy || 'N/A',
//         receipt.transactionCode || 'N/A',
//         receipt.phoneNumber || 'N/A'
//       ];

//       rowData.forEach((text, index) => {
//         doc.text(text, 
//           startX + columnWidths.slice(0, index).reduce((a, b) => a + b, 0),
//           startY,
//           { width: columnWidths[index], align: 'left' }
//         );
//       });

//       // Draw row separator
//       startY += 10;
//       doc.moveTo(50, startY).lineTo(580, startY).stroke();
//     });

//     // Add total summary
//     startY += 30;
//     const totalAmount = receipts.reduce((sum, receipt) => sum + receipt.amount, 0);
//     doc.font('Helvetica-Bold').fontSize(10)
//        .text(`Total Amount: Ksh ${totalAmount.toFixed(2)}`, 50, startY);

//     doc.end();

//   } catch (error) {
//     console.error('Error generating Receipt Report:', error);
//     const statusCode = error.message === "Tenant ID is required" ? 403 : 500;
//     res.status(statusCode).json({ 
//       error: error.message || 'Failed to generate Receipt Report' 
//     });
//   }
// }



// module.exports = { generatePaymentReportPDF,generateMpesaReport,generateReceiptReport,generateIncomeReport };