const { fetchTenantDetails, fetchTenant } = require('../tenants/tenantupdate.js');
const { generatePDFHeader } = require('./header.js');
const { PrismaClient } = require('@prisma/client');
const PDFDocument = require('pdfkit');
const dayjs = require('dayjs');

const prisma = new PrismaClient();

async function generateAgeAnalysisReport(req, res) {
  try {
    const tenantId = req.user.tenantId;
    const tenant = await fetchTenant(tenantId);
    const today = dayjs();

    // Fetch unpaid invoices for customers belonging to the tenant
    const invoices = await prisma.invoice.findMany({
      where: {
        tenantId,
        status: 'UNPAID',
      },
      include: {
        customer: true,
      },
    });

    // Categorize customers by overdue period
    const categorizedData = {
      '0-30 days': [],
      '31-60 days': [],
      '61-90 days': [],
      '90+ days': [],
    };

    invoices.forEach(invoice => {
      const daysOverdue = today.diff(dayjs(invoice.invoicePeriod), 'day');
      const outstandingBalance = invoice.invoiceAmount - invoice.amountPaid;
      const customerId = invoice.customer.id;

      let category;
      if (daysOverdue <= 30) category = '0-30 days';
      else if (daysOverdue <= 60) category = '31-60 days';
      else if (daysOverdue <= 90) category = '61-90 days';
      else category = '90+ days';

      if (!categorizedData[category].find(c => c.id === customerId)) {
        categorizedData[category].push({
          id: customerId,
          customerName: `${invoice.customer.firstName} ${invoice.customer.lastName}`,
          phoneNumber: invoice.customer.phoneNumber || 'N/A',
          monthlyCharge: invoice.invoiceAmount.toFixed(2), // Assuming invoice amount is the monthly charge
          totalOutstanding: 0,
        });
      }

      const customer = categorizedData[category].find(c => c.id === customerId);
      customer.totalOutstanding += outstandingBalance;
    });

    // Create PDF Document
    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Disposition', 'attachment; filename="age_analysis_report.pdf"');
    res.setHeader('Content-Type', 'application/pdf');
    doc.pipe(res);

    // Header
    generatePDFHeader(doc, tenant);
    doc.fontSize(14).font("Helvetica-Bold").text('Age Analysis Report', { align: 'center' });
    doc.moveDown();

    const columnWidths = [180, 120, 100, 120]; // Adjusted column widths
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

    function addCategoryTitle(title, count, yPosition) {
      doc.fontSize(12).font("Helvetica-Bold").text(`${title} (${count} Customer${count > 1 ? 's' : ''})`, { underline: true });
      doc.moveDown(0.5);
      return doc.y;
    }

    Object.keys(categorizedData).forEach(category => {
      const categoryCount = categorizedData[category].length;
      if (categoryCount > 0) {
        let rowY = addCategoryTitle(category, categoryCount, doc.y);

        drawTableRow(rowY, ['Customer Name', 'Phone Number', 'MonthlyCharge', 'TotalOutstanding'], true);
        rowY += 30;

        categorizedData[category].forEach(customer => {
          if (rowY > 700) { // Avoid page overflow
            doc.addPage();
            rowY = 50;
          }

          drawTableRow(rowY, [
            customer.customerName,
            customer.phoneNumber,
            `$${customer.monthlyCharge}`,
            `$${customer.totalOutstanding.toFixed(2)}`,
          ]);

          rowY += 30;
        });

        doc.moveDown(2); // Add spacing after each category
      }
    });

    // Finalize PDF
    doc.end();
  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).json({ success: false, message: 'Error generating report' });
  }
}

module.exports = { generateAgeAnalysisReport };
