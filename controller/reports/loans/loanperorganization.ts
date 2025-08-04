import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from 'pdf-lib';
import { PrismaClient, LoanStatus } from '@prisma/client';
import { Request, Response } from 'express';

import fs from 'fs/promises';
import path from 'path';
import { fetchTenant, TenantDetails } from '../fetchteant';
import { AuthenticatedRequest } from '../../../middleware/verifyToken';
import { Loan } from '../../../types/loans/loan';

const prisma = new PrismaClient();



interface User {
  firstName: string;
  lastName: string;
}

interface Organization {
  name: string;
  interest: number;
}


export const generateDisbursedLoansPerOrganization = async (req: AuthenticatedRequest, res: Response) => {
  const startTime = Date.now();
  try {
    const { id: userId, tenantId, role } = req.user!;
    if (!tenantId) throw new Error("Tenant ID is required");

    const tenant = await fetchTenant(tenantId);
    if (!tenant) return res.status(404).json({ message: "Tenant not found" });

    const { month, year } = req.query as { month: string; year?: string };
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
        consolidatedRepayment:true,
      },
      orderBy: {
        organizationId: "asc",
      },
    }) as Loan[];

    if (!loans || loans.length === 0) {
      return res.status(404).json({ message: "No disbursed loans found for this period." });
    }

    // Group loans by organization
    const grouped: Record<string, Loan[]> = {};
    for (const loan of loans) {
      const orgName = loan.organization?.name || "Unknown Org";
      if (!grouped[orgName]) grouped[orgName] = [];
      grouped[orgName].push(loan);
    }

    // Create PDF document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // Letter size (8.5x11 in points)

    // Load fonts
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Generate header
    await generatePDFHeader(pdfDoc, page, tenant, boldFont, regularFont);

    const monthName = start.toLocaleString("en-US", { month: "long" });
    const titleText = `Disbursed Loan Report Per Organization - ${monthName} ${selectedYear}`;
    
    page.drawText(titleText, {
      x: 50,
      y: page.getHeight() - 150,
      size: 12,
      font: boldFont,
      color: rgb(0, 0, 0),
    });

    const columnWidths = [50, 100, 70, 60, 60, 80, 80];
    const startX = 50;
    let currentY = page.getHeight() - 180;

    function drawTableRow(y: number, data: string[], isHeader = false) {
      let x = startX;
      data.forEach((text, i) => {
        page.drawText(text, {
          x: x + 2,
          y: y - 10,
          size: 8,
          font: isHeader ? boldFont : regularFont,
        });
        page.drawRectangle({
          x,
          y: y - 20,
          width: columnWidths[i],
          height: 20,
          borderColor: rgb(0, 0, 0),
          borderWidth: 1,
        });
        x += columnWidths[i];
      });
    }

    if (Object.keys(grouped).length === 0) {
      page.drawText("⚠️ No disbursed loan records found.", {
        x: 50,
        y: currentY,
        size: 12,
        font: regularFont,
      });
    }

    for (const orgName in grouped) {
      const orgLoans = grouped[orgName];
      const total = orgLoans.reduce((sum, l) => sum + l.totalRepayable, 0);

      // Org Title
      page.drawText(`Organization: ${orgName}`, {
        x: startX,
        y: currentY,
        size: 10,
        font: boldFont,
      });

      page.drawText(`Total Payable: Ksh ${total.toFixed(2)}`, {
        x: startX,
        y: currentY - 15,
        size: 8,
        font: regularFont,
      });

      currentY -= 40;
      drawTableRow(currentY, ["ID", "Customer", "Amount", "Interest", "Duration", "Disbursed", "Payable"], true);
      currentY -= 25;

      for (const loan of orgLoans) {
        if (currentY < 50) {
          const newPage = pdfDoc.addPage([612, 792]);
          currentY = page.getHeight() - 50;
          drawTableRow(currentY, ["ID", "Customer", "Amount", "Interest", "Duration", "Disbursed", "Payable"], true);
          currentY -= 25;
        }

       drawTableRow(currentY, [
  loan.id.toString(),
  `${loan.user?.firstName || ''} ${loan.user?.lastName || ''}`,
  loan.amount.toFixed(2),
  `${(loan?.organization?.interestRate || 0 * 100).toFixed(1)}%`,
  loan.disbursedAt?.toISOString().split("T")[0] ?? "N/A",
  `${loan.duration}d`,
  loan.totalRepayable.toFixed(2),
]);

        currentY -= 25;
      }

      currentY -= 20;
    }

    const pdfBytes = await pdfDoc.save();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=disbursed-loans-org-${month}-${selectedYear}.pdf`);
    res.send(pdfBytes);

    console.log("✅ Loan report generated in", `${Date.now() - startTime}ms`);
  } catch (err) {
    console.error("❌ Loan report error:", err instanceof Error ? err.message : String(err));
    if (!res.headersSent) {
      res.status(500).json({ message: err instanceof Error ? err.message : "Failed to generate report." });
    }
  }
};

async function generatePDFHeader(
  pdfDoc: PDFDocument,
  page: PDFPage,
  tenant: TenantDetails,
  boldFont: PDFFont,
  regularFont: PDFFont
) {
  // Header background (light gray)
  page.drawRectangle({
    x: 0,
    y: page.getHeight() - 120,
    width: page.getWidth(),
    height: 120,
    color: rgb(0.96, 0.96, 0.96),
    borderWidth: 0,
  });

  // Add logo if available
  if (tenant.logoUrl) {
    try {
      const logoPath = path.join(__dirname, '..', '..', 'uploads', tenant.logoUrl);
      const logoBytes = await fs.readFile(logoPath);
      const logoImage = await pdfDoc.embedPng(logoBytes);
      
      page.drawImage(logoImage, {
        x: page.getWidth() - 80,
        y: page.getHeight() - 50,
        width: 60,
        height: 60 * (logoImage.height / logoImage.width),
      });
    } catch (error) {
      console.warn('⚠️ Could not load logo:', error);
    }
  }

  // Tenant name (centered)
 
  // Calculate the x-coordinate to center the text
const textWidth = boldFont.widthOfTextAtSize(tenant.name || 'Unnamed Tenant', 16);
const centerX = (page.getWidth() - textWidth) / 2;

// Tenant name (centered)
page.drawText(tenant.name || 'Unnamed Tenant', {
  x: centerX,
  y: page.getHeight() - 40,
  size: 16,
  font: boldFont,
  color: rgb(0.2, 0.2, 0.2),
  maxWidth: page.getWidth(),
});

  // Tenant details (two columns)
  const leftX = 50;
  const rightX = 350;
  const detailsY = page.getHeight() - 90;
  const lineHeight = 15;

  // Left column
  page.drawText(`Street: ${tenant.street || 'N/A'}`, {
    x: leftX,
    y: detailsY,
    size: 10,
    font: regularFont,
  });
  page.drawText(`Phone: ${tenant.phoneNumber || 'N/A'}`, {
    x: leftX,
    y: detailsY - lineHeight,
    size: 10,
    font: regularFont,
  });
  page.drawText(`Email: ${tenant.email || 'N/A'}`, {
    x: leftX,
    y: detailsY - 2 * lineHeight,
    size: 10,
    font: regularFont,
  });

  // Right column
  page.drawText(`County: ${tenant.county || 'N/A'}`, {
    x: rightX,
    y: detailsY,
    size: 10,
    font: regularFont,
  });
  page.drawText(`Town: ${tenant.town || 'N/A'}`, {
    x: rightX,
    y: detailsY - lineHeight,
    size: 10,
    font: regularFont,
  });
  page.drawText(`Address: ${tenant.address || 'N/A'}`, {
    x: rightX,
    y: detailsY - 2 * lineHeight,
    size: 10,
    font: regularFont,
  });

  // Separator line
  page.drawLine({
    start: { x: 50, y: page.getHeight() - 120 },
    end: { x: 562, y: page.getHeight() - 120 },
    thickness: 1.5,
    color: rgb(0, 0.48, 1),
  });
}