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
        Tenant: { connect: { id: tenantId } },
        User: { connect: { id: userId } },
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

    if (!tenantId) {
      res.status(400).json({ success: false, message: "Tenant ID missing from user session" });
      return;
    }

    const organizationIdNumber = Number(organizationId);
    if (isNaN(organizationIdNumber)) {
      res.status(400).json({ success: false, message: "Invalid organization ID" });
      return;
    }

    // Verify tenant exists
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      res.status(404).json({ success: false, message: "Tenant (Lender Organization) not found" });
      return;
    }

    // Verify organization exists
    const organization = await prisma.organization.findFirst({
      where: { id: organizationIdNumber, tenantId },
    });
    if (!organization) {
      res.status(404).json({ success: false, message: "Organization not found" });
      return;
    }

    // Perform cascading deletes in a transaction
    await prisma.$transaction(
      async (tx) => {
        // Step 1: Delete payment confirmations
        await tx.paymentConfirmation.deleteMany({
          where: {
            OR: [
              { LoanPayout: { Loan: { organizationId: organizationIdNumber } } },
              { PaymentBatch: { organizationId: organizationIdNumber } },
            ],
          },
        });

        // Step 2: Delete loan payouts
        await tx.loanPayout.deleteMany({
          where: { Loan: { organizationId: organizationIdNumber } },
        });

        // Step 3: Delete payment batches
        await tx.paymentBatch.deleteMany({
          where: { organizationId: organizationIdNumber },
        });

        // Step 4: Delete consolidated repayments
        await tx.consolidatedRepayment.deleteMany({
          where: { organizationId: organizationIdNumber },
        });

        // Step 5: Delete loans
        await tx.loan.deleteMany({
          where: { organizationId: organizationIdNumber },
        });

        // Step 6: Delete audit logs for users under this org
        await tx.auditLog.deleteMany({
          where: {
            User: {
              Employee: { organizationId: organizationIdNumber },
            },
          },
        });

        // Step 7: Delete users linked to employees in this organization
        await tx.user.deleteMany({
          where: {
            Employee: { organizationId: organizationIdNumber },
          },
        });

        // Step 8: Delete employees
        await tx.employee.deleteMany({
          where: { organizationId: organizationIdNumber },
        });

        // Step 9: Delete the organization
        await tx.organization.delete({
          where: { id: organizationIdNumber },
        });

        // Step 10: Log the deletion action
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            action: "HARD_DELETE_BORROWER_ORGANIZATION",
            resource: "Organization",
            details: {
              organizationId: organizationIdNumber,
              message: "Organization and all related data permanently deleted",
            },
          },
        });
      },
      { timeout: 10000 } // 10-second timeout
    );

    res.status(200).json({
      success: true,
      message: "Organization and all related data deleted successfully",
    });
  } catch (error: any) {
    console.error("❌ Failed to hard delete Borrower Organization:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting organization and related data",
      error: error.message ?? error,
    });
  }
};
