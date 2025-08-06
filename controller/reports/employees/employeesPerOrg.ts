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
  res.setTimeout(2 * 60 * 1000); // 2-minute timeout

  try {
    const { tenantId } = req.user!;
    if (!tenantId) return res.status(400).json({ message: 'Tenant ID is required' });

    console.time("⏳ Fetch Tenant");
    const tenant = await fetchTenant(tenantId);
    console.timeEnd("⏳ Fetch Tenant");
    if (!tenant || !tenant.name) {
      console.error(`Invalid tenant data for tenantId: ${tenantId}`);
      return res.status(404).json({ message: "Tenant not found or invalid." });
    }

    console.time("⏳ Fetch Employees");
    const employees = await prisma.employee.findMany({
      where: { tenantId },
      include: { organization: true },
      orderBy: { organizationId: 'asc' },
    });

    console.log(`list of employees ${JSON.stringify(employees)}`);
    console.timeEnd("⏳ Fetch Employees");

    if (!employees || employees.length === 0) {
      console.error(`No employees found for tenantId: ${tenantId}`);
      return res.status(404).json({ message: "No employees found for the given tenant." });
    }

    console.log(`Fetched ${employees.length} employees`);

    const grouped: Record<string, typeof employees> = {};

for (const emp of employees) {
  const orgName = emp.organization?.name?.trim() || `Org-${emp.organizationId}`; // fallback
  if (!grouped[orgName]) grouped[orgName] = [];
  grouped[orgName].push(emp);
}


    const pdfDoc = await PDFDocument.create();
    let page = pdfDoc.addPage([612, 792]);

    let boldFont, regularFont;
    try {
      boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    } catch (fontError) {
      console.error('❌ Font embedding error:', fontError);
      throw new Error('Failed to embed fonts');
    }

    await generatePDFHeader(pdfDoc, page, tenant, boldFont, regularFont);

    page.drawText(`Employees Per Organization`, {
      x: 50,
      y: page.getHeight() - 150,
      size: 12,
      font: boldFont,
    });

    const columnWidths = [40, 100, 100, 100, 100, 80]; // Adjusted for 6 columns
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
      drawTableRow(currentY, ['ID', 'First Name', 'Last Name', 'Phone', 'ID Number', 'Gross Salary'], true);
      currentY -= 25;

      for (const emp of orgEmployees) {
        if (currentY < 100) {
          page = pdfDoc.addPage([612, 792]);
          currentY = page.getHeight() - 50;
          //await generatePDFHeader(pdfDoc, page, tenant, boldFont, regularFont);
          drawTableRow(currentY, ['ID', 'First Name', 'Last Name', 'Phone', 'ID Number', 'Gross Salary'], true);
          currentY -= 25;
        }

        if (!emp.firstName || !emp.lastName || !emp.phoneNumber || !emp.idNumber || emp.grossSalary == null) {
          console.error(`Skipping invalid employee data: ${JSON.stringify(emp)}`);
          continue;
        }

        drawTableRow(currentY, [
          emp.id.toString(),
          emp.firstName,
          emp.lastName,
          emp.phoneNumber,
          emp.idNumber,
          emp.grossSalary.toFixed(2),
        ]);

        currentY -= 25;
      }

      currentY -= 15;
    }

    const pdfBytes = await pdfDoc.save();
    console.log('Sending PDF response...');
 res.setHeader('Content-Type', 'application/pdf');
res.setHeader('Content-Disposition', 'inline; filename="employees-per-org.pdf"');
res.end(pdfBytes);


    console.log("✅ Employee report generated in", `${Date.now() - startTime}ms`);
  } catch (error) {
    console.error('❌ Failed to generate employee report:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Failed to generate report'});
    }
  } finally {
    await prisma.$disconnect();
  }
};