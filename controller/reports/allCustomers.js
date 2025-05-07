const { PrismaClient } = require('@prisma/client');
const PDFDocument = require('pdfkit');
const prisma = new PrismaClient();
const fs = require('fs');
const { promises: fsPromises } = require('fs');
const path = require('path');
const {  fetchTenant } = require('../tenants/tenantupdate.js');
const { generatePDFHeader } = require('./header.js');
 // Import header function


 

 
 async function getAllActiveCustomersReport(req, res) {
   const tenantId = req.user?.tenantId;
 
   if (!tenantId) {
     return res.status(401).json({ message: "Tenant not identified." });
   }
 
   try {
     const customers = await prisma.customer.findMany({
       where: { status: 'ACTIVE', tenantId },
       select: {
         firstName: true,
         lastName: true,
         phoneNumber: true,
         email: true,
         monthlyCharge: true,
         closingBalance: true,
         garbageCollectionDay: true,
       }
     });
 
     if (!customers.length) {
       return res.status(404).json({ message: "No active customers found." });
     }
 
     const tenant = await fetchTenant(tenantId);
     if (!tenant) {
       return res.status(404).json({ message: "Tenant details not found." });
     }
 
     const reportsDir = path.join(__dirname, '..', 'reports');
     await fsPromises.mkdir(reportsDir, { recursive: true });
 
     const filePath = path.join(reportsDir, 'activecustomersreport.pdf');
     console.log('File Path:', filePath);
 
     // Generate the PDF report with reduced font size
     const doc = new PDFDocument({ margin: 50 });
     res.setHeader('Content-Type', 'application/pdf');
     res.setHeader('Content-Disposition', 'attachment; filename="activecustomersreport.pdf"');
 
     doc.pipe(res);

     generatePDFHeader(doc, tenant);
 
     // Header with reduced font size
     doc.font('Helvetica').fontSize(12).text('Active Customers Report', { align: 'center' });
     doc.moveDown(1);
 
     // Table Header
     const columnWidths = [100, 120, 100, 120, 100, 100];
     const startX = 50;
 
     function drawTableRow(y, data, isHeader = false) {
       let x = startX;
 
       // Use reduced font size for headers and content
       if (isHeader) {
         doc.font('Helvetica-Bold').fontSize(8); // Header font size
       } else {
         doc.font('Helvetica').fontSize(8); // Content font size
       }
 
       data.forEach((text, index) => {
         doc.text(text, x + 5, y + 5, { width: columnWidths[index] });
         doc.rect(x, y, columnWidths[index], 25).stroke();
         x += columnWidths[index];
       });
     }
 
     // Drawing table rows with reduced font size for data
     drawTableRow(doc.y, ['First Name', 'Last Name', 'Phone', 'Email', 'Monthly Charge', 'Closing Balance'], true);
     let rowY = doc.y + 30;
 
     customers.forEach(customer => {
       if (rowY > 700) { // Avoid page overflow
         doc.addPage();
         rowY = 50;
         drawTableRow(rowY, ['First Name', 'Last Name', 'Phone', 'Email', 'Monthly Charge', 'Closing Balance'], true);
         rowY += 30;
       }
 
       drawTableRow(rowY, [
         customer.firstName,
         customer.lastName,
         customer.phoneNumber || 'N/A',
         customer.email || 'N/A',
         `$${customer.monthlyCharge.toFixed(2)}`,
         `$${customer.closingBalance.toFixed(2)}`,
       ]);
 
       rowY += 30;
     });
 
     // Finalize PDF
     doc.end();
 
   } catch (error) {
     console.error('Error fetching active customer report:', error);
     res.status(500).json({ error: 'Error generating report' });
   }
 }
 

 

async function generatePDF(customers, tenant, filePath) {
  const doc = new PDFDocument({ margin: 50 });

  return new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    // **Use the reusable header function**
   generatePDFHeader(doc, tenant);

    doc.fontSize(16).font('Helvetica-Bold').text('Weekly Active Customers Report',50,doc.y).
    
    moveDown(2);

    // Group customers by garbage collection day
    const groupedByCollectionDay = customers.reduce((acc, customer) => {
      const day = customer.garbageCollectionDay || 'Unknown';
      if (!acc[day]) {
        acc[day] = { count: 0, customers: [], totalClosingBalance: 0, monthlyTotal: 0 };
      }
      acc[day].count += 1;
      acc[day].customers.push(customer);
      acc[day].totalClosingBalance += customer.closingBalance || 0;
      acc[day].monthlyTotal += customer.monthlyCharge || 0;
      return acc;
    }, {});

    // Add grouped customer data to the PDF
    Object.entries(groupedByCollectionDay).forEach(([day, { count, customers, totalClosingBalance, monthlyTotal }]) => {
      doc.fontSize(14).font('Helvetica-Bold').text(`Collection Day: ${day} (Total Customers: ${count})`).moveDown();

      // Table headers
      doc.font('Helvetica-Bold')
        .text('Name', 50, doc.y, { width: 150, continued: true })
        .text('Phone', 200, doc.y, { width: 100, continued: true })
        .text('Balance', 300, doc.y, { width: 100, continued: true })
        .text('Monthly Charge', 400, doc.y, { width: 100 })
        .moveDown();

      // Draw a horizontal line under headers
      doc.moveTo(50, doc.y - 5).lineTo(550, doc.y - 5).stroke();
      doc.moveDown();

      // Add customer data
      doc.font('Helvetica');
      customers.forEach(customer => {
        doc.text(`${customer.firstName} ${customer.lastName}`, 50, doc.y, { width: 150, continued: true })
          .text(customer.phoneNumber || 'N/A', 200, doc.y, { width: 100, continued: true })
          .text(`KSH ${customer.closingBalance?.toFixed(2) ?? '0.00'}`, 300, doc.y, { width: 100, continued: true })
          .text(`KSH ${customer.monthlyCharge?.toFixed(2) ?? '0.00'}`, 400, doc.y, { width: 100 })
          .moveDown();
      });

      doc.moveDown();
      doc.fontSize(12).font('Helvetica-Bold').text(`Total Closing Balance: KSH ${totalClosingBalance.toFixed(2)}`);
      doc.fontSize(12).font('Helvetica-Bold').text(`Total Monthly Charges: KSH ${monthlyTotal.toFixed(2)}`);
      doc.moveDown(2);
    });

    // **Finalize PDF**
    doc.end();

    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });
}








async function generateGarbageCollectionReport(req, res) {
  try {
    const tenantId = req.user.tenantId;
    const tenant = await fetchTenant(tenantId);

    // Fetch customers with garbage collection information
    const customers = await prisma.customer.findMany({
      where: {
        tenantId,
      },
    });

    if (customers.length === 0) {
      return res.status(404).json({ success: false, message: 'No customers found for garbage collection' });
    }

    // Group customers by collection day
    const groupedByCollectionDay = customers.reduce((acc, customer) => {
      const collectionDay = customer.garbageCollectionDay || 'Unknown';

      if (!acc[collectionDay]) {
        acc[collectionDay] = [];
      }

      acc[collectionDay].push(customer);
      return acc;
    }, {});

    // Create PDF Document
    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Disposition', 'attachment; filename="garbage_collection_report.pdf"');
    res.setHeader('Content-Type', 'application/pdf');
    doc.pipe(res);

    // Header
    generatePDFHeader(doc, tenant);
    doc.fontSize(12).font("Helvetica-Bold").text('Customers Per Collection Day', { align: 'center' });
    doc.moveDown();

    const columnWidths = [150, 120, 120, 150, 150, 100]; // Customize as needed
    const startX = 10;

    function drawTableRow(y, data, isHeader = false) {
      let x = startX;

      if (isHeader) {
        doc.font("Helvetica-Bold").fontSize(8); // Header font size
      } else {
        doc.font("Helvetica").fontSize(8); // Regular row font size
      }

      data.forEach((text, index) => {
        doc.text(text, x + 5, y + 5, { width: columnWidths[index], lineBreak: false });
        doc.rect(x, y, columnWidths[index], 25).stroke();
        x += columnWidths[index];
      });
    }

    // Iterate over each collection day and create a section for it
    Object.keys(groupedByCollectionDay).forEach(collectionDay => {
      // Display the count of customers for this collection day
      const customerCount = groupedByCollectionDay[collectionDay].length;
      doc.fontSize(10).font("Helvetica").text(`Collection Day: ${collectionDay} (Total Customers: ${customerCount})`, { align: 'left' });
      doc.moveDown();

      // Table Header
      drawTableRow(doc.y, ['Customer Name', 'Phone Number', 'Town', 'Location', 'Estate Name', 'Service Type'], true);
      let rowY = doc.y + 30;

      // Table Data for customers in this collection day group
      groupedByCollectionDay[collectionDay].forEach(customer => {
        if (rowY > 700) { // Avoid page overflow
          doc.addPage();
          rowY = 50;
          drawTableRow(rowY, ['Customer Name', 'Phone Number', 'Town', 'Location', 'Estate Name', 'Service Type'], true);
          rowY += 30;
        }

        drawTableRow(rowY, [
          `${customer.firstName} ${customer.lastName}`,
          customer.phoneNumber || 'N/A',
          customer.town || 'N/A',
          customer.location || 'N/A',
          customer.estateName || 'N/A',
          customer.garbageCollectionDay || 'N/A',
        ]);

        rowY += 30;
      });

      doc.moveDown();
    });

    // Finalize PDF
    doc.end();
  } catch (error) {
    console.error('Error generating garbage collection report:', error);
    res.status(500).json({ success: false, message: 'Error generating report' });
  }
}








module.exports = { getAllActiveCustomersReport,generateGarbageCollectionReport };
