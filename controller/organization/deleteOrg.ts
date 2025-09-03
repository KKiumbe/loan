import { PrismaClient } from '@prisma/client';
import { Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../middleware/verifyToken';


const prisma = new PrismaClient();





// Soft delete organization
export const softDeleteBorrowerOrganization = async (
  req: AuthenticatedRequest ,
  res: Response
): Promise<void> => {
  try {
    const {  organizationId } = req.params;
    const { id: userId,tenantId } = req.user!;

    // Verify tenant exists
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      res.status(404).json({ error: 'Tenant (Lender Organization) not found' });
      return;
    }

    const organizationIdNumber = Number(organizationId);


    // Verify organization exists
    const organization = await prisma.organization.findFirst({
      where: { id: organizationIdNumber, tenantId },
    });
    if (!organization) {
      res.status(404).json({ error: 'Organization not found' });
      return;
    }

    // Check for dependent records
    const dependentLoans = await prisma.loan.count({ where: { organizationId: organizationIdNumber } });
    const dependentUsers = await prisma.user.count({ where: { organizationId: organizationIdNumber } });
    const dependentEmployees = await prisma.employee.count({ where: { organizationId: organizationIdNumber } });
    if (dependentLoans > 0 || dependentUsers > 0 || dependentEmployees > 0) {
      res.status(400).json({
        error: 'Cannot delete organization with associated loans, users, or employees',
      });
      return;
    }

    // Soft delete: Update status to SUSPENDED
    await prisma.organization.update({
      where: { id: organizationIdNumber },
      data: { status: 'SUSPENDED' },
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        tenant: { connect: { id: tenantId } },
        user: { connect: { id: userId } },
        action: 'DELETE_BORROWER_ORGANIZATION',
        resource: 'Organization',
        details: {
          organizationId,
          message: 'Organization soft deleted',
        },
      },
    });

    res.status(200).json({ message: 'Organization soft deleted successfully' });
  } catch (error) {
    console.error('Failed to soft delete Borrower Organization:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Hard delete organization
export const hardDeleteBorrowerOrganization = async (
  req: AuthenticatedRequest ,
  res: Response
): Promise<void> => {
  try {
    const { organizationId } = req.params;
    const { id: userId , tenantId} = req.user!;

    // Verify tenant exists
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      res.status(404).json({ error: 'Tenant (Lender Organization) not found' });
      return;
    }
        const organizationIdNumber = Number(organizationId);


    // Verify organization exists
    const organization = await prisma.organization.findFirst({
      where: { id: organizationIdNumber, tenantId },
    });
    if (!organization) {
      res.status(404).json({ error: 'Organization not found' });
      return;
    }

    // Transaction for cascading deletes
    await prisma.$transaction([
      prisma.employee.deleteMany({ where: { organizationId: organizationIdNumber } }),
      prisma.loan.deleteMany({ where: { organizationId: organizationIdNumber } }),
      prisma.consolidatedRepayment.deleteMany({ where: { organizationId: organizationIdNumber } }),
      prisma.paymentBatch.deleteMany({ where: { organizationId: organizationIdNumber } }),
      prisma.user.updateMany({
        where: { organizationId: organizationIdNumber },
        data: { organizationId: null },
      }),
      prisma.organization.delete({ where: { id: organizationIdNumber } }),
      prisma.auditLog.create({
        data: {
          tenant: { connect: { id: tenantId } },
          user: { connect: { id: userId } },
          action: 'HARD_DELETE_BORROWER_ORGANIZATION',
          resource: 'Organization',
          details: {
            organizationId,
            message: 'Organization hard deleted',
          },
        },
      }),
    ]);

    res.status(200).json({ message: 'Organization deleted successfully' });
  } catch (error) {
    console.error('Failed to hard delete Borrower Organization:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};