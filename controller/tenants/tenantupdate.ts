import { PrismaClient, Tenant, TenantStatus, User } from '@prisma/client';
import { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';

// Initialize Prisma client
const prisma = new PrismaClient();

// Set up storage engine for multer to save the uploaded file
const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({ storage });

// Interfaces for type safety
interface UserAuth {
  role: string[];
  tenantId: number;
  user: number;
}

interface AuthRequest extends Request {
  user: UserAuth;
  file?: Express.Multer.File;
}

// Controller function to handle logo upload
const uploadLogo = async (req: AuthRequest, res: Response): Promise<void> => {
  const { tenantId } = req.params;

  // Check if a file was uploaded
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded.' });
    return;
  }

  try {
    // Construct the logo URL
    const logoUrl = `/uploads/${req.file.filename}`;
    // Update the tenant's logo URL in the database
    const updatedTenant = await prisma.tenant.update({
      where: { id: parseInt(tenantId, 10) },
      data: { logoUrl },
    });

    res.status(200).json({
      message: 'Logo uploaded and tenant updated successfully.',
      tenant: updatedTenant,
    });
  } catch (error) {
    console.error('Error uploading logo:', error);
    res.status(500).json({ error: 'Failed to upload logo.', details: (error as Error).message });
  }
};

// Update Tenant Details (Supports Partial Updates)
const updateTenantDetails = async (req: AuthRequest, res: Response): Promise<void> => {
  const { tenantId } = req.params;
  const updateData: Partial<Tenant> = req.body;
  const { role, tenantId: userTenantId, user: userId } = req.user;
  const tenantIdInt = parseInt(tenantId, 10);

  try {
    // Fetch the tenant to ensure it exists
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantIdInt },
    });

    if (!tenant) {
      res.status(404).json({ error: 'Tenant not found.' });
      return;
    }

    // Ensure the user belongs to the same tenant or has appropriate privileges
    if (userTenantId !== tenantIdInt && !role.includes('SUPER_ADMIN')) {
      res.status(403).json({ error: 'Access denied. You do not have permission to update this tenant.' });
      return;
    }

    // Ensure proper data types for numeric and enum values
    if (updateData.monthlyCharge !== undefined) {
      updateData.monthlyCharge = parseFloat(updateData.monthlyCharge as unknown as string);
    }
    if (updateData.allowedUsers !== undefined) {
      updateData.allowedUsers = parseInt(updateData.allowedUsers as unknown as string, 10);
    }
    if (updateData.status !== undefined) {
      if (!Object.values(TenantStatus).includes(updateData.status as TenantStatus)) {
        res.status(400).json({ error: 'Invalid tenant status.' });
        return;
      }
    }

    // Update the tenant details
    const updatedTenant = await prisma.tenant.update({
      where: { id: tenantIdInt },
      data: updateData,
    });

    // Log the changes in the audit log
    await prisma.auditLog.create({
      data: {
        action: 'UPDATE_TENANT',
        resource: 'TENANT',
        tenant: {
          connect: { id: tenantIdInt },
        },
        user: {
          connect: { id: userId },
        },
        details: {
          updatedFields: Object.keys(updateData),
        },
      },
    });

    res.status(200).json({
      message: 'Tenant details updated successfully.',
      updatedTenant,
    });
  } catch (error) {
    console.error('Error updating tenant details:', error);
    res.status(500).json({ error: 'Failed to update tenant details.', details: (error as Error).message });
  }
};

// Fetch Tenant Details
const fetchTenantDetails = async (tenantID: number, res?: Response): Promise<Partial<Tenant> | void> => {
  try {
    // Fetch the tenant with relationships
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantID },
      select: {
        name: true,
      
        status: true,
        subscriptionPlan: true,
        monthlyCharge: true,
     
        allowedUsers: true,
        createdAt: true,
        updatedAt: true,
        email: true,
        phoneNumber: true,
        alternativePhoneNumber: true,
        county: true,
        town: true,
        address: true,
        building: true,
        street: true,
        website: true,
        logoUrl: true,
        
      },
    });

    if (!tenant) {
      if (res) {
        res.status(404).json({ error: 'Tenant not found.' });
      }
      return;
    }

    return tenant;
  } catch (error) {
    console.error('Error fetching tenant details:', error);
    if (res) {
      res.status(500).json({ error: 'Failed to retrieve tenant details.', details: (error as Error).message });
    }
  }
};

// Get Tenant Details
const getTenantDetails = async (req: AuthRequest, res: Response): Promise<void> => {
  const { tenantId } = req.user;

  if (!tenantId) {
    res.status(400).json({ message: 'No tenantId found in token' });
    return;
  }

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        status: true,
        subscriptionPlan: true,
        monthlyCharge: true,
        email: true,
        phoneNumber: true,
        alternativePhoneNumber: true,
        county: true,
        town: true,
        address: true,
        building: true,
        street: true,
        website: true,
        logoUrl: true,
        allowedUsers: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            organizations: true,
          },
        },
        mpesaConfig: true,
        smsConfig: true,
      },
    });

    if (!tenant) {
      res.status(404).json({ message: 'Tenant not found' });
      return;
    }

    // Rename the count field for clarity
    const { _count, ...rest } = tenant;
    res.json({
      tenant: {
        ...rest,
        organizationCount: _count.organizations,
      },
    });
  } catch (err) {
    console.error('getTenant error', err);
    res.status(500).json({ message: 'Failed to fetch tenant' });
  }
};

// Fetch Tenant
const fetchTenant = async (tenantId: number): Promise<Partial<Tenant>> => {
  try {
    if (!tenantId) throw new Error('Tenant ID is required');

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
     
        status: true,
        subscriptionPlan: true,
        monthlyCharge: true,
    
        email: true,
        phoneNumber: true,
        alternativePhoneNumber: true,
        allowedUsers: true,
      },
    });

    if (!tenant) throw new Error('Tenant not found');

    return tenant;
  } catch (error) {
    console.error('Error fetching tenant details:', (error as Error).message);
    throw error;
  }
};

export { updateTenantDetails, getTenantDetails, uploadLogo, fetchTenant,fetchTenantDetails, upload };