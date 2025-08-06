import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from 'pdf-lib';
import { PrismaClient } from '@prisma/client';
import { Request, Response } from 'express';

import fs from 'fs/promises';
import path from 'path';
import { AuthenticatedRequest } from '../../../middleware/verifyToken';
import { fetchTenant } from '../fetchteant';
import { generatePDFHeader } from '../header';

const prisma = new PrismaClient();



export const generateEmployeesPerOrganization = async (req: AuthenticatedRequest, res: Response) => {
  const startTime = Date.now();
  res.setTimeout(2 * 60 * 1000); // Extend response timeout to 2 minutes

  try {
    const { tenantId } = req.user!;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID is required' });

    console.time("⏳ Fetch Tenant");
    const tenant = await fetchTenant(tenantId);
    console.timeEnd("⏳ Fetch Tenant");

    console.time("⏳ Fetch Employees");
    const employees = await prisma.employee.findMany({
      where: { tenantId },
      include: { organization: true },
      orderBy: { organizationId: 'asc' },
    });
    console.timeEnd("⏳ Fetch Employees");

    if (employees.length === 0) {
      return res.status(404).json({ message: "No employees found." });
    }

    const grouped = employees.reduce((acc, emp) => {
      const orgName = emp.organization?.name || 'Unknown Org';
      if (!acc[orgName]) acc[orgName] = [];
      acc[orgName].push(emp);
      return acc;
    }, {} as Record<string, typeof employees>);

    const pdfDoc = await PDFDocument.create();
    let page = pdfDoc.addPage([612, 792]);

    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    await generatePDFHeader(pdfDoc, page, tenant, boldFont, regularFont);

    page.drawText(`Employees Per Organization`, {
      x: 50,
      y: page.getHeight() - 150,
      size: 12,
      font: boldFont,
    });

    const columnWidths = [40, 120, 120, 100, 100];
    let startX = 50;
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

    for (const orgName in grouped) {
      const orgEmployees = grouped[orgName];

      page.drawText(`Organization: ${orgName}`, {
        x: startX,
        y: currentY,
        size: 10,
        font: boldFont,
      });

      currentY -= 25;
      drawTableRow(currentY, ['ID', 'First Name', 'Last Name', 'Phone', 'Gross Salary'], true);
      currentY -= 25;

      for (const emp of orgEmployees) {
        if (currentY < 50) {
          page = pdfDoc.addPage([612, 792]); // Start new page
          currentY = page.getHeight() - 50;
          drawTableRow(currentY, ['ID', 'First Name', 'Last Name', 'Phone', 'Gross Salary'], true);
          currentY -= 25;
        }

        drawTableRow(currentY, [
          emp.id.toString(),
          emp.firstName,
          emp.lastName,
          emp.phoneNumber,
          emp.grossSalary.toFixed(2),
        ]);

        currentY -= 25;
      }

      currentY -= 15;
    }

    const pdfBytes = await pdfDoc.save();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=employees-per-org.pdf`);
    res.send(pdfBytes);

    console.log("✅ Employee report generated in", `${Date.now() - startTime}ms`);
  } catch (error) {
    console.error('❌ Failed to generate employee report:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Failed to generate report' });
    }
  }
};
