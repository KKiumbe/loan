import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs/promises';
import path from 'path';

interface Tenant {
  name?: string;
  logoUrl?: string;
  street?: string;
  phoneNumber?: string;
  email?: string;
  county?: string;
  town?: string;
  address?: string;
  building?: string;
}

export async function generatePDFHeader(pdfDoc: PDFDocument, tenant: Tenant) {
  // Add a new page (or use existing one)
  const page = pdfDoc.addPage([612, 792]); // Letter size (8.5x11 in points)

  // Header background (light gray rectangle)
  page.drawRectangle({
    x: 0,
    y: page.getHeight() - 120, // 120pt tall header
    width: page.getWidth(),
    height: 120,
    color: rgb(0.96, 0.96, 0.96), // #f5f5f5
    borderWidth: 0,
  });

  // Load fonts
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Add logo (if exists)
  if (tenant.logoUrl) {
    try {
      const logoPath = path.join(__dirname, tenant.logoUrl);
      const logoBytes = await fs.readFile(logoPath);
      const logoImage = await pdfDoc.embedPng(logoBytes);
      
      page.drawImage(logoImage, {
        x: page.getWidth() - 80, // Right-aligned
        y: page.getHeight() - 50,
        width: 60,
        height: 60 * (logoImage.height / logoImage.width),
      });
    } catch (error) {
      console.warn('⚠️ Could not load logo:', error);
    }
  }

  // Tenant name (centered at top)
  page.drawText(tenant.name || 'Unnamed Tenant', {
    x: 0,
    y: page.getHeight() - 40,
    size: 16,
    font: boldFont,
    color: rgb(0.2, 0.2, 0.2), // #333333
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
  // ... add other left fields with y -= lineHeight

  // Right column
  page.drawText(`County: ${tenant.county || 'N/A'}`, {
    x: rightX,
    y: detailsY,
    size: 10,
    font: regularFont,
  });
  // ... add other right fields with y -= lineHeight

  // Separator line (blue)
  page.drawLine({
    start: { x: 50, y: page.getHeight() - 120 },
    end: { x: 562, y: page.getHeight() - 120 },
    thickness: 1.5,
    color: rgb(0, 0.48, 1), // #007bff
  });
}

// Usage example
