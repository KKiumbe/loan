const PDFDocument = require("pdfkit");
const { PrismaClient, LoanStatus } = require("@prisma/client");
const { generatePDFHeader } = require("../header.js");
const {fetchTenant} = require("../fetchteant.js");

const prisma = new PrismaClient();

const generateDisbursedLoansPerOrganization = async (req, res) => {
  const startTime = Date.now();
  try {
    const { tenantId } = req.user;
    if (!tenantId) throw new Error("Tenant ID is required");

    const tenant = await fetchTenant(tenantId);
    if (!tenant) return res.status(404).json({ message: "Tenant not found" });

    const { month, year } = req.query;
    const monthInt = parseInt(month, 10);
    const selectedYear = year ? parseInt(year, 10) : new Date().getFullYear();

    if (!month || isNaN(monthInt) || monthInt < 1 || monthInt > 12) {
      throw new Error("Month must be an integer between 1 and 12");
    }

    const start = new Date(selectedYear, monthInt - 1, 1);
    const end = new Date(selectedYear, monthInt, 0);

    const loans = await prisma.loan.findMany({
      where: {
        tenantId,
        status: LoanStatus.DISBURSED,
        disbursedAt: {
          gte: start,
          lte: end,
        },
      },
      include: {
        user: true,
        organization: true,
      },
      orderBy: {
        organizationId: "asc",
      },
    });

    if (!loans || loans.length === 0) {
      return res.status(404).json({ message: "No disbursed loans found for this period." });
    }

    // ✅ Group loans by organization
    const grouped = {};
    for (const loan of loans) {
      const orgName = loan.organization?.name || "Unknown Org";
      if (!grouped[orgName]) grouped[orgName] = [];
      grouped[orgName].push(loan);
    }

    // ✅ Start PDF generation
    const doc = new PDFDocument({ margin: 50 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=disbursed-loans-org-${month}-${selectedYear}.pdf`);
    doc.pipe(res);

   await generatePDFHeader(doc, tenant); // Ensure this is synchronous

    const monthName = start.toLocaleString("en-US", { month: "long" });
    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .text(`Disbursed Loan Report Per Organization - ${monthName} ${selectedYear}`, {
        align: "center",
      })
      .moveDown();

    const columnWidths = [50, 100, 70, 60, 60, 80, 80];
    const startX = 10;

    function drawTableRow(y, data, isHeader = false) {
      let x = startX;
      doc.font(isHeader ? "Helvetica-Bold" : "Helvetica").fontSize(8);
      data.forEach((text, i) => {
        doc.text(String(text), x + 5, y + 7, { width: columnWidths[i], lineBreak: false });
        doc.rect(x, y, columnWidths[i], 25).stroke();
        x += columnWidths[i];
      });
    }

    let rowY = doc.y;

    if (Object.keys(grouped).length === 0) {
      doc.fontSize(12).text("⚠️ No disbursed loan records found.", { align: "center" });
    }

    for (const orgName in grouped) {
      const orgLoans = grouped[orgName];
      const total = orgLoans.reduce((sum, l) => sum + l.totalRepayable, 0);

      // Org Title
      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .text(`Organization: ${orgName}`, startX, rowY + 20)
        .fontSize(8)
        .text(`Total Payable: Ksh ${total.toFixed(2)}`, { align: "left" })
        .moveDown();

      rowY = doc.y + 10;
      drawTableRow(rowY, ["ID", "Customer", "Amount", "Interest", "Duration", "Disbursed", "Payable"], true);
      rowY += 30;

      for (const loan of orgLoans) {
        if (rowY > 700) {
          doc.addPage();
          rowY = 70;
          drawTableRow(rowY, ["ID", "Customer", "Amount", "Interest", "Duration", "Disbursed", "Payable"], true);
          rowY += 30;
        }

        drawTableRow(rowY, [
          loan.id,
          `${loan.user?.firstName || ''} ${loan.user?.lastName || ''}`,
          loan.amount.toFixed(2),
          `${(loan?.organization?.interest * 100).toFixed(1)}%`,
          `${loan.duration}d`,
          loan.disbursedAt.toISOString().split("T")[0],
          loan.totalRepayable.toFixed(2),
        ]);

        rowY += 30;
      }

      doc.moveDown();
      rowY = doc.y + 10;
    }

    doc.end();
    console.log("✅ Loan report generated in", `${Date.now() - startTime}ms`);
  } catch (err) {
    console.error("❌ Loan report error:", err.message);
    if (!res.headersSent) {
      res.status(500).json({ message: err.message || "Failed to generate report." });
    }
  }
};

module.exports = { generateDisbursedLoansPerOrganization };
