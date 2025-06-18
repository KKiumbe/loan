// controllers/employeeController.js
const csv = require('csv-parser');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const bulkUploadFromCSV = async (req, res) => {
  const { tenantId, organizationId } = req.body;

  if (!tenantId || !organizationId) {
    return res.status(400).json({ error: 'tenantId and organizationId are required in the body' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'CSV file is required' });
  }

  const buffer = req.file.buffer;
  const results = [];
  const failed = [];

  const stream = require('streamifier').createReadStream(buffer).pipe(csv());

  stream.on('data', (row) => {
    results.push(row);
  });

  stream.on('end', async () => {
    const created = [];

    for (const emp of results) {
      try {
        const {
          phoneNumber,
          idNumber,
          firstName,
          lastName,
          grossSalary,
          jobId,
          secondaryPhoneNumber,
        } = emp;

        if (!phoneNumber || !idNumber || !firstName || !lastName || !grossSalary) {
          failed.push({ ...emp, reason: 'Missing required fields' });
          continue;
        }

        const exists = await prisma.employee.findUnique({ where: { phoneNumber } });
        if (exists) {
          failed.push({ ...emp, reason: 'Duplicate phone number' });
          continue;
        }

        const createdEmp = await prisma.employee.create({
          data: {
            phoneNumber,
            idNumber,
            firstName,
            lastName,
            grossSalary: parseFloat(grossSalary),
            jobId,
            secondaryPhoneNumber,
            tenantId: parseInt(tenantId),
            organizationId: parseInt(organizationId),
          },
        });

        created.push(createdEmp);
      } catch (err) {
        failed.push({ ...emp, reason: 'Error creating record' });
      }
    }

    res.json({
      success: true,
      created: created.length,
      failed: failed.length,
      failedRecords: failed,
    });
  });

  stream.on('error', (err) => {
    console.error(err);
    res.status(500).json({ error: 'Failed to parse CSV file' });
  });
};

module.exports = {
  bulkUploadFromCSV,
};
