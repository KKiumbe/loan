import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs/promises';
import path from 'path';
import { TenantDetails } from './fetchteant';



export async function generatePDFHeader(
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
    start: { x: 50, y: page.getHeight() - 130 },
    end: { x: 562, y: page.getHeight() - 130 },
    thickness: 1.5,
    color: rgb(0, 0.48, 1),
  });
}

// Usage example
