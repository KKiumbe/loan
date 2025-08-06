import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from 'pdf-lib';
import { PrismaClient, LoanStatus } from '@prisma/client';
import { Request, Response } from 'express';

import fs from 'fs/promises';
import path from 'path';
import { fetchTenant, TenantDetails } from '../fetchteant';
import { AuthenticatedRequest } from '../../../middleware/verifyToken';
import { Loan } from '../../../types/loans/loan';
import { generatePDFHeader } from '../header';

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
    const { tenantId } = req.user!;
    if (!tenantId) throw new Error("Tenant ID is required");

    const tenant = await fetchTenant(tenantId);
    if (!tenant) return res.status(404).json({ message: "Tenant not found" });

    const { month } = req.body; // Expecting format: "2025-08"

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ message: "Month must be in YYYY-MM format" });
    }

    const [year, monthIndex] = month.split('-').map(Number);
    const start = new Date(year, monthIndex - 1, 1);
    const end = new Date(year, monthIndex, 0, 23, 59, 59);

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
        consolidatedRepayment: true,
      },
      orderBy: {
        organizationId: "asc",
      },
    });

    if (!loans.length) {
      return res.status(404).json({ message: "No disbursed loans found for this period." });
    }

    // Group by organization
    const grouped: Record<string, typeof loans> = {};
    for (const loan of loans) {
      const orgName = loan.organization?.name || "Unknown Org";
      if (!grouped[orgName]) grouped[orgName] = [];
      grouped[orgName].push(loan);
    }

    // Create PDF
    const pdfDoc = await PDFDocument.create();
    let page = pdfDoc.addPage([612, 792]);

    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    await generatePDFHeader(pdfDoc, page, tenant, boldFont, regularFont);

    const monthName = start.toLocaleString("en-US", { month: "long" });
    page.drawText(`Disbursed Loan Report Per Organization - ${monthName} ${year}`, {
      x: 50,
      y: page.getHeight() - 150,
      size: 12,
      font: boldFont,
    });

    const columnWidths = [40, 100, 60, 50, 40, 60, 60, 60, 60];
    const startX = 50;
    let currentY = page.getHeight() - 180;

    const drawTableRow = (y: number, data: string[], isHeader = false) => {
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
    };

    drawTableRow(currentY, ["ID", "Customer", "Type", "Amount", "Rate", "Charge", "Disbursed", "Duration", "Margin"], true);
    currentY -= 25;

    for (const orgName in grouped) {
      const orgLoans = grouped[orgName];

      const totalLoanAmount = orgLoans.reduce((sum, l) => sum + l.amount, 0);
      const totalTransactionCharge = orgLoans.reduce((sum, l) => sum + l.transactionCharge, 0);
      const totalMargin = orgLoans.reduce((sum, l) => sum + (l.totalRepayable - l.amount), 0);

      if (currentY < 100) {
        page = pdfDoc.addPage([612, 792]);
        currentY = page.getHeight() - 50;
        drawTableRow(currentY, ["ID", "Customer", "Type", "Amount", "Rate", "Charge", "Disbursed", "Duration", "Margin"], true);
        currentY -= 25;
      }

      currentY -= 10;

      page.drawText(`Organization: ${orgName}`, {
        x: startX,
        y: currentY,
        size: 10,
        font: boldFont,
      });

      currentY -= 20;

      for (const loan of orgLoans) {
        if (currentY < 50) {
          page = pdfDoc.addPage([612, 792]);
          currentY = page.getHeight() - 50;
          drawTableRow(currentY, ["ID", "Customer", "Type", "Amount", "Rate", "Charge", "Disbursed", "Duration", "Margin"], true);
          currentY -= 25;
        }

        drawTableRow(currentY, [
          loan.id.toString(),
          `${loan.user?.firstName || ''} ${loan.user?.lastName || ''}`,
          loan.loanType,
          loan.amount.toFixed(2),
          `${(loan.interestRate * 100).toFixed(1)}%`,
          loan.transactionCharge.toFixed(2),
          loan.disbursedAt?.toISOString().split("T")[0] ?? "N/A",
          `${loan.duration}d`,
          (loan.totalRepayable - loan.amount).toFixed(2),
        ]);

        currentY -= 25;
      }

      currentY -= 10;

      page.drawText(`Total Amount: Ksh ${totalLoanAmount.toFixed(2)}`, {
        x: startX,
        y: currentY,
        size: 9,
        font: boldFont,
      });
      page.drawText(`Total Charges: Ksh ${totalTransactionCharge.toFixed(2)}`, {
        x: startX + 200,
        y: currentY,
        size: 9,
        font: boldFont,
      });
      page.drawText(`Total Margin: Ksh ${totalMargin.toFixed(2)}`, {
        x: startX + 400,
        y: currentY,
        size: 9,
        font: boldFont,
      });

      currentY -= 30;
    }

    const pdfBytes = await pdfDoc.save();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="loans-per-organization.pdf"');
    res.end(pdfBytes);

    console.log("✅ Loan report generated in", `${Date.now() - startTime}ms`);
  } catch (err) {
    console.error("❌ Loan report error:", err instanceof Error ? err.message : String(err));
    if (!res.headersSent) {
      res.status(500).json({ message: err instanceof Error ? err.message : "Failed to generate report." });
    }
  } finally {
    await prisma.$disconnect();
  }
};

