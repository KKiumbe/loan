const pdfMake = require("pdfmake/build/pdfmake");
const pdfFonts = require("pdfmake/build/vfs_fonts");
const PDFDocument = require("pdfkit");

const { fetchTenantDetails, fetchTenant } = require("../tenants/tenantupdate.js");
const { PrismaClient } = require("@prisma/client");
const { generatePDFHeader } = require("./header.js");

const prisma = new PrismaClient();

const generateMonthlyInvoiceReport = async (req, res, month) => {
    const tenantId = req.user?.tenantId;
    if (!tenantId) throw new Error("Tenant ID is required");
  
    const tenant = await fetchTenant(tenantId);
  
    const invoices = await prisma.invoice.findMany({
      where: { tenantId },
      select: {
        invoicePeriod: true,
        invoiceNumber: true,
        invoiceAmount: true,
        closingBalance: true,
        status: true,
        customer: {
          select: {
            firstName: true,
            lastName: true,
            phoneNumber: true,
          },
        },
      },
    });
  
    if (invoices.length === 0) {
      return res.status(404).json({ success: false, message: "No invoices found" });
    }
  
    const doc = new PDFDocument({ margin: 50 });
    res.setHeader("Content-Disposition", 'attachment; filename="monthly_invoice_report.pdf"');
    res.setHeader("Content-Type", "application/pdf");
    doc.pipe(res);
  
    generatePDFHeader(doc, tenant);
  
    // **Header**
    doc.fontSize(12).font("Helvetica-Bold").text("Monthly Invoice Report", { align: "center" });
    doc.moveDown();
  
    // **Table Configuration**
    const columnWidths = [100, 70, 70, 70, 70, 120, 120];
    const startX = 10;
  
    function drawTableRow(y, data, isHeader = false) {
      let x = startX;
  
      if (isHeader) {
        doc.font("Helvetica-Bold").fontSize(8); // Header font size
      } else {
        doc.font("Helvetica").fontSize(8); // Regular row font size
      }
  
      data.forEach((text, index) => {
        doc.text(text, x + 5, y + 7, { width: columnWidths[index], lineBreak: false });
        doc.rect(x, y, columnWidths[index], 25).stroke();
        x += columnWidths[index];
      });
    }
  
    // **Table Header**
    drawTableRow(doc.y, [
      "Period",
      "Invoice #",
      "Amount",
      "Balance",
      "Status",
      "Name",
      "PhoneNumber",
    ], true);
  
    let rowY = doc.y + 30;
  
    // **Table Data**
    invoices.forEach((invoice) => {
      if (rowY > 700) { // Avoids page overflow
        doc.addPage();
        rowY = 70;
        drawTableRow(rowY, [
          "Invoice Period",
          "Invoice #",
          "Invoice Amount",
          "Closing Balance",
          "Status",
          "Customer Name",
          "Phone Number",
        ], true);
        rowY += 30;
      }
  
      drawTableRow(rowY, [
        invoice.invoicePeriod.toISOString().split("T")[0], // Format date
        invoice.invoiceNumber.substring(0, 5), // **Clipped Invoice Number**
        invoice.invoiceAmount.toFixed(2),
        invoice.closingBalance.toFixed(2),
        invoice.status,
        `${invoice.customer.firstName} ${invoice.customer.lastName}`,
        invoice.customer.phoneNumber || "N/A",
      ]);
  
      rowY += 30;
    });
  
    // **Finalize PDF**
    doc.end();
  };
  

module.exports = { generateMonthlyInvoiceReport };
