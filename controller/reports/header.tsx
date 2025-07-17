import PDFDocument from 'pdfkit';
import path from 'path'
import fs from 'fs';
import { Tenant } from '../../types/tenant/tenenant'; // Ensure this interface is defined correctly
import { PDFDocumentCustom } from '../../types/reports/report';



// Define a minimal interface for PDFDocument


export async function generatePDFHeader(doc: PDFDocumentCustom, tenant: Tenant): Promise<void> {
  if (!doc || typeof doc !== 'object') {
    throw new Error('PDF document object is required');
  }

  if (!tenant || typeof tenant !== 'object') {
    throw new Error('Tenant data is required');
  }

  // Construct logo path
  let logoPath: string | undefined;
  if (tenant.logoUrl && typeof tenant.logoUrl === 'string') {
    logoPath = path.join(__dirname, '..', 'Uploads', path.basename(tenant.logoUrl));
  }

  // Add logo if available
  if (logoPath && fs.existsSync(logoPath)) {
    try {
      doc.image(logoPath, 50, 20, { width: 60 });
    } catch (error: any) {
      console.warn('⚠️ Error adding logo to PDF:', error.message);
    }
  } else if (tenant.logoUrl) {
    console.warn('⚠️ Logo file not found:', logoPath || tenant.logoUrl);
  }

  // Tenant name
  doc
    .fontSize(18)
    .font('Helvetica-Bold')
    .fillColor('#333333')
    .text(tenant.name || 'Unnamed Tenant', 0, 25, { align: 'center' });

  // Tenant details
  doc
    .fontSize(10)
    .font('Helvetica')
    .fillColor('#555555');

  const leftX = 50;
  const rightX = 350;
  const detailsY = 60;

  // Left column
  doc
    .text(`Street: ${tenant.street || 'N/A'}`, leftX, detailsY)
    .text(`Phone: ${tenant.phoneNumber || 'N/A'}`, leftX, detailsY + 15)
    .text(`Email: ${tenant.email || 'N/A'}`, leftX, detailsY + 30);

  // Right column
  doc
    .text(`County: ${tenant.county || 'N/A'}`, rightX, detailsY)
    .text(`Town: ${tenant.town || 'N/A'}`, rightX, detailsY + 15)
    .text(`Address: ${tenant.address || 'N/A'}`, rightX, detailsY + 30)
    .text(`Building: ${tenant.building || 'N/A'}`, rightX, detailsY + 45);

  // Divider line
  doc
    .moveTo(50, 120)
    .lineTo(562, 120)
    .lineWidth(1.5)
    .strokeColor('#007bff')
    .stroke();

  // Reset fill color for next section
  doc.fillColor('#000000');
}

