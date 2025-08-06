import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { PrismaClient } from '@prisma/client';
import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../../../middleware/verifyToken';
import { fetchTenant } from '../fetchteant';
import { generatePDFHeader } from '../header';


import dayjs from 'dayjs';
const prisma = new PrismaClient();



export const generateLoanSummaryReport = async (req: AuthenticatedRequest, res: Response) => {
  const startTime = Date.now();
  res.setTimeout(2 * 60 * 1000);

  try {
    const { tenantId } = req.user!;
    const { month } = req.body; // ⬅️ Accept month from request body

    if (!tenantId) return res.status(400).json({ message: 'Tenant ID is required' });
    if (!month) return res.status(400).json({ message: 'Month (YYYY-MM) is required' });

    const startDate = dayjs(`${month}-01`).startOf('month').toDate();
    const endDate = dayjs(startDate).endOf('month').toDate();

    const tenant = await fetchTenant(tenantId);
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });

    const loans = await prisma.loan.findMany({
      where: {
        tenantId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: { organization: true },
    });

    if (!loans.length) return res.status(404).json({ message: 'No loans found for selected month' });

    const grouped = new Map<
      string,
      {
        totalLoans: number;
        totalAmount: number;
        disbursed: number;
        rejected: number;
        pending: number;
        approved: number;
      }
    >();

    for (const loan of loans) {
      const orgName = loan.organization?.name || `Org-${loan.organizationId}`;
      if (!grouped.has(orgName)) {
        grouped.set(orgName, {
          totalLoans: 0,
          totalAmount: 0,
          disbursed: 0,
          rejected: 0,
          pending: 0,
          approved: 0,
        });
      }

      const summary = grouped.get(orgName)!;
      summary.totalLoans += 1;
      summary.totalAmount += loan.amount;

      switch (loan.status) {
        case 'DISBURSED':
          summary.disbursed += loan.amount;
          break;
        case 'REJECTED':
          summary.rejected += loan.amount;
          break;
        case 'PENDING':
          summary.pending += loan.amount;
          break;
        case 'APPROVED':
          summary.approved += loan.amount;
          break;
      }
    }

    // 📄 Generate PDF
    const pdfDoc = await PDFDocument.create();
    let page = pdfDoc.addPage([612, 792]);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    await generatePDFHeader(pdfDoc, page, tenant, boldFont, regularFont);

    page.drawText(`Loan Summary Per Organization – ${month}`, {
      x: 50,
      y: page.getHeight() - 150,
      size: 12,
      font: boldFont,
    });

    const headers = ['Org', 'Loans', 'Avg Amount', 'Disbursed', 'Rejected', 'Pending', 'Approved(not disbursed)'];
    const colWidths = [150, 50, 70, 70, 70, 60, 100];
    let currentY = page.getHeight() - 180;

    const drawRow = (y: number, data: string[], isHeader = false) => {
      let x = 50;
      for (let i = 0; i < data.length; i++) {
        page.drawText(data[i], {
          x: x + 2,
          y: y - 10,
          size: 8,
          font: isHeader ? boldFont : regularFont,
        });
        page.drawRectangle({
          x,
          y: y - 20,
          width: colWidths[i],
          height: 20,
          borderColor: rgb(0, 0, 0),
          borderWidth: 1,
        });
        x += colWidths[i];
      }
    };

    drawRow(currentY, headers, true);
    currentY -= 25;

    for (const [orgName, summary] of grouped) {
      if (currentY < 80) {
        page = pdfDoc.addPage([612, 792]);
        currentY = page.getHeight() - 50;
        await generatePDFHeader(pdfDoc, page, tenant, boldFont, regularFont);
        drawRow(currentY, headers, true);
        currentY -= 25;
      }

      drawRow(currentY, [
        orgName,
        summary.totalLoans.toString(),
        (summary.totalAmount / summary.totalLoans).toFixed(2),
        summary.disbursed.toFixed(2),
        summary.rejected.toFixed(2),
        summary.pending.toFixed(2),
        summary.approved.toFixed(2),
      ]);

      currentY -= 25;
    }

    const pdfBytes = await pdfDoc.save();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="loan-summary.pdf"');
    res.end(pdfBytes);

    console.log('✅ Loan summary generated in', `${Date.now() - startTime}ms`);
  } catch (error) {
    console.error('❌ Error generating loan summary:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Failed to generate report' });
    }
  } finally {
    await prisma.$disconnect();
  }
};
