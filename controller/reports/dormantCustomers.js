const { fetchTenantDetails, fetchTenant } = require('../tenants/tenantupdate.js');
const { generatePDFHeader } = require('./header.js');
const { PrismaClient } = require('@prisma/client');
const PDFDocument = require('pdfkit');
const dayjs = require('dayjs');

const prisma = new PrismaClient();

async function generateDormantCustomersReport(req, res) {
  try {
    const tenantId = req.user.tenantId;
    const tenant = await fetchTenant(tenantId);

    // Fetch inactive customers belonging to the tenant
    const customers = await prisma.customer.findMany({
      where: {
        tenantId,
        status: 'INACTIVE', // Fetch only inactive customers
      },
    });

    if (customers.length === 0) {
      return res.status(404).json({ success: false, message: 'No dormant customers found' });
    }

    // Create PDF Document
    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Disposition', 'attachment; filename="dormant_customers_report.pdf"');
    res.setHeader('Content-Type', 'application/pdf');
    doc.pipe(res);

    // Header
    generatePDFHeader(doc, tenant);
    doc.fontSize(16).text('Dormant Customers Report', { align: 'center' });
    doc.moveDown();

    const columnWidths = [200, 120, 150, 150];
    const startX = 50;

    function drawTableRow(y, data, isHeader = false) {
      const textOptions = isHeader ? { bold: true } : {};
      let x = startX;
      
      data.forEach((text, index) => {
        doc.text(text, x + 5, y + 5, { width: columnWidths[index], ...textOptions });
        doc.rect(x, y, columnWidths[index], 25).stroke();
        x += columnWidths[index];
      });
    }

    // Table Header
    drawTableRow(doc.y, ['Customer Name', 'Phone Number', 'Email', 'Status'], true);
    let rowY = doc.y + 30;

    // Table Data
    customers.forEach(customer => {
      if (rowY > 700) { // Avoid page overflow
        doc.addPage();
        rowY = 50;
        drawTableRow(rowY, ['Customer Name', 'Phone Number', 'Email', 'Status'], true);
        rowY += 30;
      }

      drawTableRow(rowY, [
        customer.firstName + ' ' + customer.lastName,
        customer.phoneNumber || 'N/A',
        customer.email || 'N/A',
        customer.status,
      ]);

      rowY += 30;
    });

    // Finalize PDF
    doc.end();
  } catch (error) {
    console.error('Error generating dormant customers report:', error);
    res.status(500).json({ success: false, message: 'Error generating report' });
  }
}

module.exports = { generateDormantCustomersReport };
