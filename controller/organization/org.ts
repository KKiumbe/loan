import { Request, Response, NextFunction } from 'express';
import { PrismaClient, Organization, Tenant, User, Loan } from '@prisma/client';

import { z } from 'zod';
import { CreateOrganizationRequest, GetBorrowerOrganizationsQuery, OrganizationParams, OrganizationriolizedAdminsResponse, OrganizationSearchResponse, OrganizationStatsResponse, SearchQueryParams } from '../../types/organization';
import { AuthenticatedRequest} from '../../middleware/verifyToken';
const prisma = new PrismaClient();





// Define the schema for the request body (replacing OrganizationBody)
export const OrganizationBodySchema = z.object({
  name: z.string().min(1, 'Organization name is required'),
  approvalSteps: z.number().int().positive().optional(),
  loanLimitMultiplier: z.number().positive().optional(),
  interestRate: z.number().nonnegative().optional(),
});



export const createBorrowerOrganization = async (
  req: AuthenticatedRequest & { body: CreateOrganizationRequest },
  res: Response
): Promise<void> => {
  const {
    name,
    approvalSteps,
    loanLimitMultiplier,
    interestRate,
    interestRateType,
    dailyInterestRate,
    baseInterestRate
  } = req.body;

  const { tenantId, id: userId } = req.user!;

  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      res.status(404).json({ error: 'Tenant (Lender Organization) not found' });
      return;
    }

    const loanMultiplier = loanLimitMultiplier !== undefined ? loanLimitMultiplier / 100 : 1.0;

    let processedInterestRate = interestRate !== undefined ? interestRate / 100 : 0.1;
    let processedDailyRate = dailyInterestRate !== undefined ? dailyInterestRate / 100 : 0.01;
    let processedBaseRate = baseInterestRate !== undefined ? baseInterestRate / 100 : 0.1;

    const organization = await prisma.organization.create({
      data: {
        name,
        tenantId,
        approvalSteps: approvalSteps ?? 1,
        loanLimitMultiplier: loanMultiplier,
        interestRateType,
        interestRate: interestRateType === 'MONTHLY' ? processedInterestRate : 0.1,
        dailyInterestRate: interestRateType === 'DAILY' ? processedDailyRate : 0.01,
        baseInterestRate: interestRateType === 'DAILY' ? processedBaseRate : 0.1,
      },
    });

    await prisma.auditLog.create({
      data: {
        tenant: { connect: { id: tenantId } },
        user: { connect: { id: userId } },
        action: 'CREATE_BORROWER_ORGANIZATION',
        resource: 'Organization',
        details: {
          organizationId: organization.id,
          name,
          approvalSteps: approvalSteps ?? 1,
          loanLimitMultiplier: loanLimitMultiplier ?? 100,
          interestRateType,
          interestRate: interestRate ?? 10,
          dailyInterestRate: dailyInterestRate ?? 1,
          baseInterestRate: baseInterestRate ?? 10,
        },
      },
    });

    res.status(200).json({ message: 'Organization created successfully' });

  } catch (error) {
    console.error('Failed to create Borrower Organization:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};



// Mock SMS sending function
const sendSMS = async (phoneNumber: string, message: string): Promise<void> => {
  console.log(`SMS to ${phoneNumber}: ${message}`);
};

// Create a borrower organization






export const searchOrganizations = async (
  req: AuthenticatedRequest & { query: SearchQueryParams },
  res: Response
): Promise<void> => {
  try {
    // Ensure auth middleware ran
    if (!req.user?.id) {
      console.error('No user in request. Authentication middleware missing or failed.');
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    // Extract or lookup tenantId
    let tenantId: number = req.user.tenantId ?? 0;
    if (!tenantId) {
      const authUser = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { tenantId: true },
      });
      if (!authUser) {
        console.error(`Authenticated user record not found: id=${req.user.id}`);
        res.status(404).json({ message: 'Authenticated user not found' });
        return;
      }
      tenantId = authUser.tenantId;
    }

    // Parse query params
    const { name = '', page = '1', limit = '20' } = req.query;
    const take: number = Math.min(parseInt(limit, 10) || 20, 100);
    const skip: number = Math.max((parseInt(page, 10) - 1) * take, 0);

    console.log('Searching organizations with params:', {
      userId: req.user.id,
      tenantId,
      name,
      page,
      limit,
      take,
      skip,
    });

    // Perform the search + count
    const [orgs, total] = await Promise.all([
      prisma.organization.findMany({
        where: {
          tenantId,
          name: { contains: name, mode: 'insensitive' },
        },
        skip,
        take,
        orderBy: { name: 'asc' },
        include: {
          _count: {
            select: { Employee: true, loans: true, PaymentBatch: true },
          },
        },
      }),
      prisma.organization.count({
        where: {
          tenantId,
          name: { contains: name, mode: 'insensitive' },
        },
      }),
    ]);

    // Shape the response
    const organizations: OrganizationSearchResponse[] = orgs.map((o) => ({
      id: o.id,
      name: o.name,
      approvalSteps: o.approvalSteps,
      interestRate: o.interestRate ?? null,
      employeeCount: o._count.Employee ?? null, // Fixed: Use _count.Employee
      loanCount: o._count.loans ?? null,
      batchCount: o._count.PaymentBatch ?? null,
      createdAt: o.createdAt,
    }));

    console.log(`Fetched ${organizations.length} organizations for tenant ${tenantId}`);
    res.json({ organizations, total });
  } catch (error: any) {
    console.error('Error searching organizations:', {
      message: error.message,
      stack: error.stack,
      query: req.query,
      user: req.user,
    });
    res.status(500).json({
      message: 'Internal server error',
      error: error.message,
    });
  }
};



// Update a borrower organization
export const updateBorrowerOrganization = async (
  req: AuthenticatedRequest & { params: OrganizationParams; body: Partial<CreateOrganizationRequest> },
  res: Response
): Promise<void> => {
  const { organizationId } = req.params;
  const { name, approvalSteps, loanLimitMultiplier, interestRate , interestRateType, dailyInterestRate, baseInterestRate} = req.body;
   const { tenantId, id: userId } = req.user!; // Non-null assertion since verifyToken ensures req.user exists


  // Validate inputs
  if (name && typeof name !== 'string') {
    res.status(400).json({ error: 'Name must be a string' });
    return;
  }
  if (approvalSteps && (!Number.isInteger(approvalSteps) || approvalSteps < 1)) {
    res.status(400).json({ error: 'Approval steps must be a positive integer' });
    return;
  }
  if (loanLimitMultiplier && (isNaN(loanLimitMultiplier) || loanLimitMultiplier <= 0)) {
    res.status(400).json({ error: 'Loan limit multiplier must be a positive number' });
    return;
  }
  if (interestRate && (isNaN(interestRate) || interestRate < 0)) {
    res.status(400).json({ error: 'Interest rate must be a non-negative number' });
    return;
  }
   if (dailyInterestRate && (isNaN(dailyInterestRate) || dailyInterestRate < 0)) {
    res.status(400).json({ error: 'Daily interest rate must be a non-negative number' });
    return;
  }
   if (baseInterestRate && (isNaN(baseInterestRate) || baseInterestRate < 0)) {
    res.status(400).json({ error: 'Base interest rate must be a non-negative number' });
    return;
  }

  try {
    // Verify organization exists
    const organization: Organization | null = await prisma.organization.findUnique({
      where: { id: parseInt(organizationId) },
    });
    if (!organization) {
      console.error(`Borrower Organization not found: organizationId ${organizationId}`);
      res.status(404).json({ error: 'Borrower Organization not found' });
      return;
    }

    // Tenant scoping
    if (organization.tenantId !== tenantId) {
      console.error(`Access denied: User tenantId ${tenantId} does not match organization tenantId ${organization.tenantId}`);
      res.status(403).json({ error: 'You can only update organizations in your tenant' });
      return;
    }


     const processedInterestRate: number = interestRate !== undefined ? interestRate / 100 : 0.1;

    const processLoanMultiplier: number = loanLimitMultiplier !== undefined ? loanLimitMultiplier/100 : 1.0;
    const processedDailyInterestRate: number = dailyInterestRate !== undefined ? dailyInterestRate / 100 : 0.1;
    const processedBaseInterestRate: number = baseInterestRate !== undefined ? baseInterestRate / 100 : 0.1;
    

    // Update organization
    const updatedOrganization: Organization = await prisma.organization.update({
      where: { id: parseInt(organizationId) },
      data: {
        name: name ?? organization.name,
        approvalSteps: approvalSteps ?? organization.approvalSteps,
        loanLimitMultiplier: processLoanMultiplier,
        interestRate: processedInterestRate,
        interestRateType: interestRateType ?? organization.interestRateType,
        dailyInterestRate: processedDailyInterestRate,
        baseInterestRate: processedBaseInterestRate
      },
    });

    // Log the action
    // await prisma.auditLog.create({
    //   data: {
    //     tenantId,
    //     userId,
    //     action: 'UPDATE_BORROWER_ORGANIZATION',
    //     resource: 'Organization',
    //     details: {
    //       organizationId,
    //       changes: {
    //         name,
    //         approvalSteps,
    //         loanLimitMultiplier,
    //         interestRate,
    //       },
    //     },
    //   },
    // });

    console.log(`Borrower Organization updated: organizationId ${organizationId}`);
    res.status(200).json({
      message: 'Borrower Organization updated successfully',
      organization: updatedOrganization,
    });
  } catch (error: any) {
    console.error('Failed to update Borrower Organization:', error.message);
    res.status(500).json({
      error: 'Failed to update Borrower Organization',
      details: error.message,
    });
  }
};

// Get borrower organizations
export const getBorrowerOrganizations = async (
  req: AuthenticatedRequest & { query: GetBorrowerOrganizationsQuery },
  res: Response
): Promise<void> => {
  const { tenantId: queryTenantId } = req.user!;
  const { tenantId: userTenantId } = req.user!;

  try {
    // Tenant scoping
    if (queryTenantId  !== userTenantId) {
      console.error(`Access denied: User tenantId ${userTenantId} does not match requested tenantId ${queryTenantId}`);
      res.status(403).json({ error: 'You can only view organizations in your tenant' });
      return;
    }

    const organizations: Organization[] = await prisma.organization.findMany({
      where: { tenantId: queryTenantId || userTenantId },
      include: { tenant: true },
    });

    console.log(`Fetched ${organizations.length} Borrower Organizations for tenantId ${queryTenantId || userTenantId}`);
    res.status(200).json({ organizations });
  } catch (error: any) {
    console.error('Failed to fetch Borrower Organizations:', error.message);
    res.status(500).json({ error: 'Failed to fetch Borrower Organizations' });
  }
};

// Delete a borrower organization
export const deleteBorrowerOrganization = async (
  req: AuthenticatedRequest & { params: OrganizationParams },
  res: Response
): Promise<void> => {
  const { organizationId } = req.params;
  const { tenantId, id: userId } = req.user!;

  try {
    // Verify organization exists
    const organization: Organization | null = await prisma.organization.findUnique({
      where: { id: parseInt(organizationId) },
    });
    if (!organization) {
      console.error(`Borrower Organization not found: organizationId ${organizationId}`);
      res.status(404).json({ error: 'Borrower Organization not found' });
      return;
    }

    // Tenant scoping
    if (organization.tenantId !== tenantId) {
      console.error(`Access denied: User tenantId ${tenantId} does not match organization tenantId ${organization.tenantId}`);
      res.status(403).json({ error: 'You can only delete organizations in your tenant' });
      return;
    }

    await prisma.organization.delete({
      where: { id: parseInt(organizationId) },
    });

    // await prisma.auditLog.create({
    //   data: {
    //     tenantId: organization.tenantId,
    //     userId,
    //     action: 'DELETE_BORROWER_ORGANIZATION',
    //     resource: 'Organization',
    //     details: { organizationId, name: organization.name },
    //   },
    // });

    console.log(`Borrower Organization deleted: organizationId ${organizationId}`);
    res.status(200).json({ message: 'Borrower Organization deleted successfully' });
  } catch (error: any) {
    console.error('Failed to delete Borrower Organization:', error.message);
    res.status(500).json({ error: 'Failed to delete Borrower Organization' });
  }
};

// Get organizations with stats
export const getOrganizations = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const tenantId: number | undefined = req.user?.tenantId;

  try {
    if (!tenantId) {
      res.status(400).json({ message: 'Tenant ID is required' });
      return;
    }

    const organizations: (Organization & {
      _count: { Employee: number; loans: number };
      loans: Pick<Loan, 'amount' | 'status'>[];
    })[] = await prisma.organization.findMany({
      where: { tenantId },
      include: {
        _count: {
          select: {
            Employee: true,
            loans: true,
          },
        },
        loans: {
          select: {
            amount: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const data: OrganizationStatsResponse[] = organizations.map((org) => {
      const totalLoanAmount: number = org.loans.reduce((sum, loan) => sum + loan.amount, 0);
      const approvedLoanAmount: number = org.loans
        .filter((loan) => loan.status === 'APPROVED' || loan.status === 'DISBURSED')
        .reduce((sum, loan) => sum + loan.amount, 0);

      return {
        id: org.id,
        name: org.name,
        approvalSteps: org.approvalSteps,
        interestRate: org.interestRate,
        employeeCount: org._count.Employee,
        loanCount: org._count.loans,
        totalLoanAmount,
        approvedLoanAmount,
        createdAt: org.createdAt,
      };
    });

    res.status(200).json(data);
  } catch (error: any) {
    console.error('Error fetching organizations:', error);
    res.status(500).json({ message: 'Failed to fetch organization stats' });
  }
};

// Get organization by ID


export const getOrganizationById = async (
  req: AuthenticatedRequest & { params: OrganizationParams },
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const orgId: number = parseInt(req.params.orgId, 10);
    if (isNaN(orgId)) {
      res.status(400).json({ error: 'Invalid organization ID' });
      return;
    }

    const { tenantId } = req.user!;
    if (!tenantId) {
      res.status(400).json({ error: 'Tenant ID is required' });
      return;
    }

    const organization = await prisma.organization.findFirst({
      where: { id: orgId, tenantId },
      include: {
        tenant: true,
        users: true,
        loans: true,
        repayments: true,
        Employee: true,
        PaymentBatch: true,
      },
    });

    if (!organization) {
      res.status(404).json({ error: 'Organization not found' });
      return;
    }

    // Convert the relevant fields from decimals to percentages
    const responseData = {
      ...organization,
      interestRate: organization.interestRate * 100,
      dailyInterestRate: organization.dailyInterestRate * 100,
      baseInterestRate: organization.baseInterestRate * 100,
      loanLimitMultiplier: organization.loanLimitMultiplier * 100,
    };

    res.json(responseData);
  } catch (error: any) {
    next(error);
  }
};

// Update an organization


export const updateOrganization = async (
  req: AuthenticatedRequest & { params: OrganizationParams; body: Partial<CreateOrganizationRequest> },
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const orgId: number = parseInt(req.params.id, 10);
    if (isNaN(orgId)) {
      res.status(400).json({ error: 'Invalid organization ID' });
      return;
    }

    const { tenantId } = req.user!;
    const {
      name,
      approvalSteps,
      loanLimitMultiplier,
      interestRate,
      interestRateType,
      dailyInterestRate,
      baseInterestRate
    } = req.body;

    const existingOrg = await prisma.organization.findFirst({
      where: { id: orgId, tenantId },
    });

    if (!existingOrg) {
      res.status(404).json({ error: 'Organization not found or unauthorized' });
      return;
    }

    const updateData: any = {};

    if (name) updateData.name = name.trim();

    if (approvalSteps !== undefined) {
      const steps = Number(approvalSteps);
      if (!Number.isInteger(steps) || steps < 0) {
        res.status(400).json({ error: 'Approval steps must be a non-negative integer' });
        return;
      }
      updateData.approvalSteps = steps;
    }

    if (loanLimitMultiplier !== undefined) {
      const multiplier = Number(loanLimitMultiplier);
      if (isNaN(multiplier) || multiplier <= 0) {
        res.status(400).json({ error: 'Loan limit multiplier must be a positive number' });
        return;
      }
      updateData.loanLimitMultiplier = multiplier / 100;
    }

    if (interestRate !== undefined) {
      const rate = Number(interestRate);
      if (isNaN(rate) || rate < 0) {
        res.status(400).json({ error: 'Interest rate must be a non-negative number' });
        return;
      }
      updateData.interestRate = rate / 100;
    }

    if (interestRateType) {
      if (!['DAILY', 'MONTHLY'].includes(interestRateType)) {
        res.status(400).json({ error: 'Invalid interestRateType. Use DAILY or MONTHLY.' });
        return;
      }

      updateData.interestRateType = interestRateType;

      if (interestRateType === 'DAILY') {
        const daily = dailyInterestRate !== undefined ? Number(dailyInterestRate) / 100 : null;
        const base = baseInterestRate !== undefined ? Number(baseInterestRate) / 100 : null;

        if (daily === null || isNaN(daily) || daily <= 0) {
          res.status(400).json({ error: 'dailyInterestRate is required and must be positive when interestRateType is DAILY' });
          return;
        }

        if (base === null || isNaN(base) || base <= 0) {
          res.status(400).json({ error: 'baseInterestRate is required and must be positive when interestRateType is DAILY' });
          return;
        }

        updateData.dailyInterestRate = daily;
        updateData.baseInterestRate = base;
      }
    }

    const updatedOrg = await prisma.organization.update({
      where: { id: orgId },
      data: updateData,
    });

    res.status(200).json({ message: 'Organization updated successfully', organization: updatedOrg });
  } catch (error: any) {
    console.error('Error updating organization:', error);
    next(error);
  }
};


// Get organization admins
export const getOrganizationAdmins = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const { tenantId } = req.user!;

  try {
    if (!tenantId) {
      res.status(400).json({ message: 'Tenant ID required' });
      return;
    }

    const admins: OrganizationriolizedAdminsResponse[] = await prisma.user.findMany({
      where: {
        tenantId,
        role: {
          has: 'ORG_ADMIN',
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phoneNumber: true,
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
        createdAt: true,
      },
    });

    res.status(200).json(admins);
  } catch (error: any) {
    console.error('Error fetching ORG_ADMINs:', error);
    res.status(500).json({ message: 'Failed to fetch organization admins' });
  }
};