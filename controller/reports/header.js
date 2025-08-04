const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');





const  generatePDFHeader = async(doc, tenant)=> {
  console.log('generatePDFHeader - tenant:', tenant);
  if (!doc || typeof doc !== 'object') {
    throw new Error('PDF document object is required');
  }
  if (!tenant || typeof tenant !== 'object') {
    throw new Error('Tenant data is required');
  }

  // Header background (light gray)
  doc.rect(0, 0, 612, 120)
     //.fill('#f5f5f5');

  // Construct the logo file path
  let logoPath;
  if (tenant.logoUrl && typeof tenant.logoUrl === 'string') {
    // Remove leading '/Uploads/' and get the filename
    const logoFilename = path.basename(tenant.logoUrl);
    // Use the project root's Uploads directory
    logoPath = path.join(__dirname, '..', '..', 'uploads', logoFilename);
    console.log('generatePDFHeader - Attempting logo path:', logoPath);
  }

  // Add logo if it exists
  if (logoPath && fs.existsSync(logoPath)) {
    try {
      console.log('generatePDFHeader - Logo found, adding to PDF');
      doc.image(logoPath, 500, 20, { width: 60, align: 'left' });
    } catch (error) {
      console.warn('⚠️ Error adding logo to PDF:', error.message);
    }
  } else if (tenant.logoUrl) {
    console.warn('⚠️ Logo file not found:', logoPath || tenant.logoUrl);
  } else {
    console.log('generatePDFHeader - No logoUrl provided, skipping logo');
  }

  // Tenant name (larger, bold, centered)
  doc.fontSize(16)
     .font('Helvetica-Bold')
     .fillColor('#333333')
     .text(tenant?.name || 'Unnamed Tenant', 0, 25, { align: 'center' });

  // Tenant details in two columns
  doc.fontSize(10)
     .font('Helvetica')
    //  .fillColor('#555555');

  // Left column
  const leftX = 50;
  const detailsY = 90; // Moved down by ~2 lines (from 60 to 90)
  doc.text(`Street: ${tenant?.street || 'N/A'}`, leftX, detailsY)
     .text(`Phone: ${tenant?.phoneNumber || 'N/A'}`, leftX, detailsY + 15)
     .text(`Email: ${tenant?.email || 'N/A'}`, leftX, detailsY + 30);

  // Right column
  const rightX = 350;
  doc.text(`County: ${tenant?.county || 'N/A'}`, rightX, detailsY)
     .text(`Town: ${tenant?.town || 'N/A'}`, rightX, detailsY + 15)
     .text(`Address: ${tenant?.address || 'N/A'}`, rightX, detailsY + 30)
     .text(`Building: ${tenant?.building || 'N/A'}`, rightX, detailsY + 45);


     //i need space below
  doc.moveDown(2);


  doc.moveTo(50, 120)
   //  .lineTo(562, 120)
    // .lineWidth(1.5)
   //  .strokeColor('#007bff')
   //  .stroke();

  // Reset fill color and move down
  doc.fillColor('#000000')
     .moveDown();
}



module.exports = { generatePDFHeader };