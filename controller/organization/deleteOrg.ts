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
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { organizationId } = req.params;
    const { id: userId, tenantId } = req.user!;

    // Verify tenant exists
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      res.status(404).json({ success: false, message: 'Tenant (Lender Organization) not found' });
      return;
    }

    const organizationIdNumber = Number(organizationId);

    // Verify organization exists
    const organization = await prisma.organization.findFirst({
      where: { id: organizationIdNumber, tenantId },
    });
    if (!organization) {
      res.status(404).json({ success: false, message: 'Organization not found' });
      return;
    }

    // Transaction for cascading deletes in correct order
    await prisma.$transaction(async (tx) => {
      // Step 1: Delete PaymentConfirmation records (depends on PaymentBatch and LoanPayout)
      await tx.paymentConfirmation.deleteMany({
        where: {
          OR: [
            { loanPayout: { loan: { organizationId: organizationIdNumber } } },
            { paymentBatch: { organizationId: organizationIdNumber } },
          ],
        },
      });

      // Step 2: Delete LoanPayout records (depends on Loan)
      await tx.loanPayout.deleteMany({
        where: { loan: { organizationId: organizationIdNumber } },
      });

      // Step 3: Delete PaymentBatch records
      await tx.paymentBatch.deleteMany({
        where: { organizationId: organizationIdNumber },
      });

      // Step 4: Delete ConsolidatedRepayment records
      await tx.consolidatedRepayment.deleteMany({
        where: { organizationId: organizationIdNumber },
      });

      // Step 5: Delete Loan records
      await tx.loan.deleteMany({
        where: { organizationId: organizationIdNumber },
      });

      // Step 6: Delete AuditLog records for users linked to Employees in this organization
      await tx.auditLog.deleteMany({
        where: {
          user: {
            employee: { organizationId: organizationIdNumber },
          },
        },
      });

      // Step 7: Delete User records linked to Employees in this organization
      await tx.user.deleteMany({
        where: {
          employee: { organizationId: organizationIdNumber },
        },
      });

      // Step 8: Delete Employee records
      await tx.employee.deleteMany({
        where: { organizationId: organizationIdNumber },
      });

      // Step 9: Delete the Organization
      await tx.organization.delete({
        where: { id: organizationIdNumber },
      });

      // Step 10: Log the action
      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          action: 'HARD_DELETE_BORROWER_ORGANIZATION',
          resource: 'Organization',
          details: {
            organizationId: organizationIdNumber,
            message: 'Organization and all related data hard deleted',
          },
        },
      });
    }, { timeout: 10000 }); // Increase timeout to 10 seconds

    res.status(200).json({ success: true, message: 'Organization and all related data deleted successfully' });
  } catch (error) {
    console.error('Failed to hard delete Borrower Organization:', error);
    res.status(500).json({ success: false, message: 'Error deleting organization and related data' });
  }
};