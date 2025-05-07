const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');
const { PrismaClient, CustomerStatus, LandlordStatus, UnitStatus } = require('@prisma/client');
const prisma = new PrismaClient();

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '..', 'Uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({ storage });

const sanitizePhoneNumber = (phone) => {
  if (typeof phone !== 'string') return '';
  if (phone.startsWith('+254')) return '0' + phone.slice(4);
  if (phone.startsWith('254')) return '0' + phone.slice(3);
  return phone;
};



const uploadCustomers = async (req, res) => {
  const { tenantId, user: userId } = req.user;

  if (!tenantId || !userId) {
    return res.status(400).json({ success: false, message: 'Tenant or User ID missing.' });
  }

  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded.' });
  }

  const filePath = req.file.path;
  const customersToCreate = [];
  const errors = [];

  try {
    // Fetch all existing customers' phone numbers for this tenant
    const existingCustomers = await prisma.customer.findMany({
      where: { tenantId },
      select: { phoneNumber: true },
    });
    const existingPhoneNumbers = new Set(existingCustomers.map(c => c.phoneNumber));

    const processCSV = () => {
      return new Promise((resolve, reject) => {
        const rows = [];
        fs.createReadStream(filePath)
          .pipe(csv())
          .on('data', (row) => rows.push(row))
          .on('end', async () => {
            const csvPhoneNumbers = new Set();

            for (const row of rows) {
              try {
                const sanitizedPhoneNumber = sanitizePhoneNumber(row.phoneNumber);
                const landlordPhoneNumber = sanitizePhoneNumber(row.landlordPhoneNumber);

                if (!sanitizedPhoneNumber) {
                  errors.push({ row, reason: 'Missing customer phone number' });
                  continue;
                }

                // Check duplicate within CSV upload
                if (csvPhoneNumbers.has(sanitizedPhoneNumber)) {
                  errors.push({ row, reason: `Duplicate phone number ${sanitizedPhoneNumber} within file.` });
                  continue;
                }

                // Check duplicate against database
                if (existingPhoneNumbers.has(sanitizedPhoneNumber)) {
                  errors.push({ row, reason: `Phone number ${sanitizedPhoneNumber} already exists in database.` });
                  continue;
                }

                // Mark as seen in this upload
                csvPhoneNumbers.add(sanitizedPhoneNumber);

                // Find or create landlord
                let landlord = await prisma.landlord.findFirst({
                  where: { tenantId, phoneNumber: landlordPhoneNumber },
                });

                if (!landlord) {
                  landlord = await prisma.landlord.create({
                    data: {
                      tenantId,
                      firstName: row.landlordFirstName?.trim() || 'Unknown',
                      lastName: row.landlordLastName?.trim() || 'Unknown',
                      phoneNumber: landlordPhoneNumber,
                      status: LandlordStatus.ACTIVE,
                      createdAt: new Date(),
                      updatedAt: new Date(),
                    }
                  });
                }

                // Find or create building
                const buildingName = row.buildingName?.trim();
                if (!buildingName) {
                  errors.push({ row, reason: 'Missing building name' });
                  continue;
                }

                let building = await prisma.building.findFirst({
                  where: { tenantId, landlordId: landlord.id, name: buildingName }
                });

                if (!building) {
                  building = await prisma.building.create({
                    data: {
                      
                      landlord: { connect: { id: landlord.id } },
                      tenant: { connect: { id: tenantId } },
                      name: buildingName,
                      billGarbage: row.billGarbage?.toLowerCase() === 'true',
                      allowWaterBillingWithAverages: row.allowWaterBillingWithAverages?.toLowerCase() === 'true',
                      billSecurity: row.billSecurity?.toLowerCase() === 'true',
                      billAmenities: row.billAmenities?.toLowerCase() === 'true',
                      billBackupGenerator: row.billBackupGenerator?.toLowerCase() === 'true',
                      billWater: row.billWater?.toLowerCase() === 'true',
                      billServiceCharge: row.billServiceCharge?.toLowerCase() === 'true',
                      waterRate: row.waterRate ? parseFloat(row.waterRate) : null,
                      createdAt: new Date(),
                      updatedAt: new Date(),
                    }
                  });
                }

                // Find or create unit
                const unitNumber = row.unitNumber?.trim();
                if (!unitNumber) {
                  errors.push({ row, reason: 'Missing unit number' });
                  continue;
                }

                let unit = await prisma.unit.findFirst({
                  where: { tenantId, buildingId: building.id, unitNumber }
                });

                if (!unit) {
                  unit = await prisma.unit.create({
                    data: {
                      tenantId,
                      buildingId: building.id,
                      unitNumber,
                      monthlyCharge: parseFloat(row.monthlyCharge) || 0,
                      depositAmount: row.depositAmount ? parseFloat(row.depositAmount) : 0,
                      garbageCharge: row.garbageCharge ? parseFloat(row.garbageCharge) : null,
                      serviceCharge: row.serviceCharge ? parseFloat(row.serviceCharge) : null,
                      securityCharge: row.securityCharge ? parseFloat(row.securityCharge) : null,
                      amenitiesCharge: row.amenitiesCharge ? parseFloat(row.amenitiesCharge) : null,
                      backupGeneratorCharge: row.backupGeneratorCharge ? parseFloat(row.backupGeneratorCharge) : null,
                      status: UnitStatus.OCCUPIED,
                      createdAt: new Date(),
                      updatedAt: new Date(),
                    }
                  });
                }

                // Prepare new customer data
                customersToCreate.push({
                  tenantId,
                  firstName: row.firstName?.trim() || '',
                  lastName: row.lastName?.trim() || '',
                  phoneNumber: sanitizedPhoneNumber,
                  unitId: unit.id,
                  closingBalance: parseFloat(row.closingBalance) || 0,
                  status: CustomerStatus.ACTIVE,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                });

              } catch (err) {
                console.error('Row error:', err);
                errors.push({ row, reason: err.message });
              }
            }
            resolve();
          })
          .on('error', (error) => {
            reject(error);
          });
      });
    };

    await processCSV();

    if (customersToCreate.length > 0) {
      await prisma.customer.createMany({
        data: customersToCreate,
        skipDuplicates: true, // EXTRA protection
      });
    }

    fs.unlinkSync(filePath); // clean up uploaded file

    res.status(200).json({
      success: true,
      message: `${customersToCreate.length} customers created successfully.`,
      errors: errors.length > 0 ? errors : null,
    });

  } catch (error) {
    console.error('Upload error:', error);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    res.status(500).json({ success: false, message: 'Error uploading customers', error: error.message });
  }
};



// Export the upload middleware and controller functions
module.exports = {
  upload,
  uploadCustomers,
  
};