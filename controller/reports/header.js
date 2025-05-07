const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

async function generatePDFHeader(doc, tenant) {
  if (!doc || typeof doc !== 'object') {
    throw new Error('PDF document object is required');
  }
  if (!tenant || typeof tenant !== 'object') {
    throw new Error('Tenant data is required');
  }

  // Header background (light gray)
  doc.rect(0, 0, 612, 120) // 612 is the default page width in PDFKit (8.5 inches at 72 DPI)
     .fill('#f5f5f5'); // Light gray background

  // Construct the logo file path
  let logoPath;
  if (tenant.logoUrl && typeof tenant.logoUrl === 'string') {
    logoPath = path.join(__dirname, '..', 'uploads', path.basename(tenant.logoUrl));
  }

  // Add logo if it exists
  if (logoPath && fs.existsSync(logoPath)) {
    try {
      doc.image(logoPath, 50, 20, { width: 60, align: 'left' }); // Smaller logo, positioned neatly
    } catch (error) {
      console.warn('⚠️ Error adding logo to PDF:', error.message);
    }
  } else if (tenant.logoUrl) {
    console.warn('⚠️ Logo file not found:', logoPath || tenant.logoUrl);
  }

  // Tenant name (larger, bold, centered)
  doc.fontSize(18)
     .font('Helvetica-Bold')
     .fillColor('#333333') // Dark gray for professionalism
     .text(tenant?.name || 'Unnamed Tenant', 0, 25, { align: 'center' });

  // Tenant details in two columns with a professional layout
  doc.fontSize(10)
     .font('Helvetica')
     .fillColor('#555555'); // Slightly lighter gray for details

  // Left column
  const leftX = 50;
  const detailsY = 60;
  doc.text(`Street: ${tenant?.street || 'N/A'}`, leftX, detailsY)
     .text(`Phone: ${tenant?.phoneNumber || 'N/A'}`, leftX, detailsY + 15)
     .text(`Email: ${tenant?.email || 'N/A'}`, leftX, detailsY + 30);

  // Right column
  const rightX = 350;
  doc.text(`County: ${tenant?.county || 'N/A'}`, rightX, detailsY)
     .text(`Town: ${tenant?.town || 'N/A'}`, rightX, detailsY + 15)
     .text(`Address: ${tenant?.address || 'N/A'}`, rightX, detailsY + 30)
     .text(`Building: ${tenant?.building || 'N/A'}`, rightX, detailsY + 45);

  // Divider line (thicker, colored)
  doc.moveTo(50, 120) // Adjusted to fit header height
     .lineTo(562, 120)
     .lineWidth(1.5)
     .strokeColor('#007bff') // Blue for a professional touch
     .stroke();

  // Reset fill color and move down for subsequent content
  doc.fillColor('#000000')
     .moveDown();
}

module.exports = { generatePDFHeader };