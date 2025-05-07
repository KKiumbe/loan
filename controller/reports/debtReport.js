const { PrismaClient } = require('@prisma/client');
const PDFDocument = require('pdfkit');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');
const { fetchTenant } = require('../tenants/tenantupdate');
const { generatePDFHeader } = require('./header');
const fsPromises = require('fs').promises;




async function getCustomersWithHighDebt(req, res) {
  const tenantId = req.user?.tenantId;
  try {
    // Fetch customers with unpaid invoices and high debt
    const customers = await prisma.customer.findMany({
      where: {
        status: 'ACTIVE',
        tenantId: tenantId,
        invoices: {
          some: { status: 'UNPAID' },
        },
      },
      select: {
        firstName: true,
        lastName: true,
        phoneNumber: true,
       
        monthlyCharge: true,
        closingBalance: true,
        garbageCollectionDay: true,
      },
    });

    // Filter customers with high debt (closingBalance > 2 * monthlyCharge)
    const filteredCustomers = customers.filter(
      (customer) => customer.closingBalance > 2 * customer.monthlyCharge
    );

    if (filteredCustomers.length === 0) {
      return res.status(404).json({ message: "No customers with high debt found." });
    }

    // Fetch tenant details
    const tenant = await fetchTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ message: "Tenant details not found." });
    }

    // Create PDF report
    const reportsDir = path.join(__dirname, '..', 'reports');
    await fsPromises.mkdir(reportsDir, { recursive: true });

    const filePath = path.join(reportsDir, 'highdebtcustomersreport.pdf');
    console.log('File Path:', filePath);

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="highdebtcustomersreport.pdf"');

    doc.pipe(res);

    // Generate PDF header
    generatePDFHeader(doc, tenant);

    // Header with reduced font size
    doc.font('Helvetica').fontSize(12).text('Customers with High Debt Report', { align: 'center' });
    doc.moveDown(1);

    // Table Header with reduced font size
    const columnWidths = [100, 120, 100, 120, 100, 100];
    const startX = 50;

    // Function to draw table rows
    function drawTableRow(y, data, isHeader = false) {
      let x = startX;

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

    // Draw table header
    drawTableRow(doc.y, ['First Name', 'Last Name', 'Phone', 'Monthly Charge', 'Closing Balance'], true);
    let rowY = doc.y + 30;

    // Draw table rows for filtered customers
    filteredCustomers.forEach((customer) => {
      if (rowY > 700) { // Avoid page overflow
        doc.addPage();
        rowY = 50;
        drawTableRow(rowY, ['First Name', 'Last Name', 'Phone',  'Monthly Charge', 'Closing Balance'], true);
        rowY += 30;
      }

      drawTableRow(rowY, [
        customer.firstName,
        customer.lastName,
        customer.phoneNumber || 'N/A',
      
        `$${customer.monthlyCharge.toFixed(2)}`,
        `$${customer.closingBalance.toFixed(2)}`,
      ]);

      rowY += 30;
    });

    // Finalize PDF
    doc.end();
  } catch (error) {
    console.error('Error generating high debt customer report:', error);
    res.status(500).json({ error: 'Error generating report' });
  }
}







// Controller function for low balance report


async function getCustomersWithLowBalance(req, res) {
  const tenantId = req.user?.tenantId;
  try {
    // Fetch customers with unpaid invoices and low balance
    const customers = await prisma.customer.findMany({
      where: {
        status: 'ACTIVE',
        tenantId: tenantId,
        invoices: {
          some: { status: 'UNPAID' },
        },
      },
      select: {
        firstName: true,
        lastName: true,
        phoneNumber: true,
      
        monthlyCharge: true,
        closingBalance: true,
        garbageCollectionDay: true,
      },
    });

    // Filter customers with low balance (closingBalance <= monthlyCharge)
    const filteredCustomers = customers.filter(
      (customer) => customer.closingBalance <= customer.monthlyCharge
    );

    if (filteredCustomers.length === 0) {
      return res.status(404).json({ message: "No customers with low balance found." });
    }

    // Fetch tenant details
    const tenant = await fetchTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ message: "Tenant details not found." });
    }

    // Create PDF report
    const reportsDir = path.join(__dirname, '..', 'reports');
    await fsPromises.mkdir(reportsDir, { recursive: true });

    const filePath = path.join(reportsDir, 'lowbalancecustomersreport.pdf');
    console.log('File Path:', filePath);

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="lowbalancecustomersreport.pdf"');

    doc.pipe(res);

    // Generate PDF header
    generatePDFHeader(doc, tenant);

    // Header with reduced font size
    doc.font('Helvetica').fontSize(12).text('Customers with Low Balance Report', { align: 'center' });
    doc.moveDown(1);

    // Table Header with reduced font size
    const columnWidths = [100, 120, 100, 120, 100, 100];
    const startX = 50;

    // Function to draw table rows
    function drawTableRow(y, data, isHeader = false) {
      let x = startX;

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

    // Draw table header
    drawTableRow(doc.y, ['First Name', 'Last Name', 'Phone', 'Monthly Charge', 'Closing Balance'], true);
    let rowY = doc.y + 30;

    // Draw table rows for filtered customers
    filteredCustomers.forEach((customer) => {
      if (rowY > 700) { // Avoid page overflow
        doc.addPage();
        rowY = 50;
        drawTableRow(rowY, ['First Name', 'Last Name', 'Phone', 'Monthly Charge', 'Closing Balance'], true);
        rowY += 30;
      }

      drawTableRow(rowY, [
        customer.firstName,
        customer.lastName,
        customer.phoneNumber || 'N/A',
      
        `$${customer.monthlyCharge.toFixed(2)}`,
        `$${customer.closingBalance.toFixed(2)}`,
      ]);

      rowY += 30;
    });

    // Finalize PDF
    doc.end();
  } catch (error) {
    console.error('Error generating low balance customer report:', error);
    res.status(500).json({ error: 'Error generating report' });
  }
}





module.exports = {
  getCustomersWithHighDebt,
  getCustomersWithLowBalance,
  
};
