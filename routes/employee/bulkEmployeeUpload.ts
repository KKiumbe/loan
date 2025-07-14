import { PrismaClient, Employee } from '@prisma/client';
import { Request, Response } from 'express';
import csv from 'csv-parser';
import streamifier from 'streamifier';

// Define type for getUserOrganizationIdById
interface GetUserOrganizationIdById {
  (userId: number): Promise<number | null>;
}

// Mock implementation (replace with actual import)
const getUserOrganizationIdById: GetUserOrganizationIdById = async (userId: number) => {
  throw new Error('getUserOrganizationIdById not implemented');
};

const prisma = new PrismaClient();

// Interfaces for type safety
interface TokenPayload {
  id: number;
  tenantId: number;
  role: string[];
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  tenantName: string;
  organizationId?: number;
}

interface AuthenticatedRequest extends Request {
  user?: TokenPayload;
  file?: Express.Multer.File; // Multer file type for CSV upload
}

interface CSVRow {
  phoneNumber: string;
  idNumber: string;
  firstName: string;
  lastName: string;
  grossSalary: string; // CSV fields are strings
  jobId?: string;
  secondaryPhoneNumber?: string;
}

interface FailedRecord extends CSVRow {
  reason: string;
}

interface APIResponse {
  success?: boolean;
  error?: string;
  created?: number;
  failed?: number;
  failedRecords?: FailedRecord[];
}

// Bulk Upload from CSV
const bulkUploadFromCSV = async (req: AuthenticatedRequest, res: Response<APIResponse>): Promise<void> => {
  const { tenantId, organizationId } = req.body as { tenantId: string; organizationId: string };

  if (!tenantId || !organizationId) {
    res.status(400).json({ error: 'tenantId and organizationId are required in the body' });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: 'CSV file is required' });
    return;
  }

  // Authorization check
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const { tenantId: userTenantId, role } = user;
  if (parseInt(tenantId) !== userTenantId) {
    res.status(403).json({ error: 'Access denied. You can only upload for your own tenant.' });
    return;
  }

  if (role.includes('ORG_ADMIN')) {
    const userOrgId = await getUserOrganizationIdById(user.id);
    if (userOrgId !== parseInt(organizationId)) {
      res.status(403).json({ error: 'Access denied. You can only upload for your own organization.' });
      return;
    }
  }

  const buffer = req.file.buffer;
  const results: CSVRow[] = [];
  const failed: FailedRecord[] = [];

  const stream = streamifier.createReadStream(buffer).pipe(csv());

  stream.on('data', (row: CSVRow) => {
    results.push(row);
  });

  stream.on('end', async () => {
    const created: Employee[] = [];

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

        const parsedGrossSalary = parseFloat(grossSalary);
        if (isNaN(parsedGrossSalary) || parsedGrossSalary <= 0) {
          failed.push({ ...emp, reason: 'Invalid gross salary' });
          continue;
        }

        const exists = await prisma.employee.findFirst({
          where: { phoneNumber, tenantId: parseInt(tenantId) },
        });
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
            grossSalary: parsedGrossSalary,
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

  stream.on('error', (err: Error) => {
    console.error('Error parsing CSV:', err);
    res.status(500).json({ error: 'Failed to parse CSV file' });
  });
};

export {
  bulkUploadFromCSV,
  getUserOrganizationIdById,
};