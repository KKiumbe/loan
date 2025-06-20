const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const dotenv = require('dotenv');
const ROLE_PERMISSIONS = require('../../DatabaseConfig/role.js');

dotenv.config();
const prisma = new PrismaClient();



const createBorrowerOrganization = async (req, res) => {
  const { name, approvalSteps, loanLimitMultiplier, interestRate } = req.body;
  const { tenantId, id: userId } = req.user;
  console.log('req.user =', req.user); // Debugging user info

  // Validate inputs
  if (!name) {
    return res.status(400).json({ error: 'Organization name is required' });
  }
  if (approvalSteps && (!Number.isInteger(approvalSteps) || approvalSteps < 1)) {
    return res.status(400).json({ error: 'Approval steps must be a positive integer' });
  }
  if (loanLimitMultiplier && (isNaN(loanLimitMultiplier) || loanLimitMultiplier <= 0)) {
    return res.status(400).json({ error: 'Loan limit multiplier must be a positive number' });
  }
  if (interestRate && (isNaN(interestRate) || interestRate < 0)) {
    return res.status(400).json({ error: 'Interest rate must be a non-negative number' });
  }

  try {
    // Verify tenant exists
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      console.error(`Tenant not found: tenantId ${tenantId}`);
      return res.status(404).json({ error: 'Tenant (Lender Organization) not found' });
    }

    // Process interest rate (divide by 100, default to 0.1 if undefined)
    const processedInterestRate = interestRate !== undefined ? interestRate / 100 : 0.1;

    // Create organization
    const organization = await prisma.organization.create({
      data: {
        name,
        tenantId,
        approvalSteps: approvalSteps || 1,
        loanLimitMultiplier: loanLimitMultiplier || 1.0,
        interestRate: processedInterestRate,
      },
    });

    // Log the action with processed interest rate
    await prisma.auditLog.create({
      data: {
        tenant: { connect: { id: tenantId } },
        user: { connect: { id: userId } },
        action: 'CREATE_BORROWER_ORGANIZATION',
        resource: 'Organization',
        details: {
          organizationId: organization.id,
          name,
          approvalSteps: approvalSteps || 1,
          loanLimitMultiplier: loanLimitMultiplier || 1.0,
          interestRate: processedInterestRate, // Store processed value
        },
      },
    });

    console.log(`Borrower Organization created: organizationId ${organization.id}`);
    res.status(201).json({ message: 'Borrower Organization created successfully', organization });
  } catch (error) {
    console.error('Failed to create Borrower Organization:', error.message);
    res.status(500).json({ error: 'Failed to create Borrower Organization', details: error.message });
  } finally {
    await prisma.$disconnect();
  }
};



const searchOrganizations = async (req, res) => {
  try {
    // 1) Ensure auth middleware ran
    if (!req.user?.id) {
      console.error('No user in request. Authentication middleware missing or failed.');
      return res.status(401).json({ message: 'Authentication required' });
    }

    // 2) Extract or lookup tenantId
    let tenantId = req.user.tenantId;
    if (!tenantId) {
      const authUser = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { tenantId: true }
      });
      if (!authUser) {
        console.error(`Authenticated user record not found: id=${req.user.id}`);
        return res.status(404).json({ message: 'Authenticated user not found' });
      }
      tenantId = authUser.tenantId;
    }

    // 3) Parse query params
    const { name = '', page = '1', limit = '20' } = req.query;
    const take = Math.min(parseInt(limit, 10) || 20, 100);
    const skip = Math.max((parseInt(page, 10) - 1) * take, 0);

    console.log('Searching organizations with params:', {
      userId: req.user.id,
      tenantId,
      name,
      page,
      limit,
      take,
      skip
    });

    // 4) Perform the search + count
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

    // 5) Shape the response
    const organizations = orgs.map(o => ({
      id: o.id,
      name: o.name,
      approvalSteps: o.approvalSteps,
      interestRate: o.interestRate ?? null,
      employeeCount: o._count.Employee,
      loanCount: o._count.loans,
      batchCount: o._count.PaymentBatch,
      createdAt: o.createdAt,
    }));

    console.log(`Fetched ${organizations.length} organizations for tenant ${tenantId}`);
    return res.json({ organizations, total });
  } catch (err) {
    console.error('Error searching organizations:', {
      message: err.message,
      stack: err.stack,
      query: req.query,
      user: req.user,
    });
    return res.status(500).json({
      message: 'Internal server error',
      error: err.message
    });
  }
};




// Update an existing borrower organization
const updateBorrowerOrganization = async (req, res) => {
  const { organizationId } = req.params;
  const { name, approvalSteps, loanLimitMultiplier, interestRate } = req.body;
  const { tenantId, id: userId } = req.user;

  // Validate inputs
  if (name && typeof name !== 'string') {
    return res.status(400).json({ error: 'Name must be a string' });
  }
  if (approvalSteps && (!Number.isInteger(approvalSteps) || approvalSteps < 1)) {
    return res.status(400).json({ error: 'Approval steps must be a positive integer' });
  }
  if (loanLimitMultiplier && (isNaN(loanLimitMultiplier) || loanLimitMultiplier <= 0)) {
    return res.status(400).json({ error: 'Loan limit multiplier must be a positive number' });
  }
  if (interestRate && (isNaN(interestRate) || interestRate < 0)) {
    return res.status(400).json({ error: 'Interest rate must be a non-negative number' });
  }

  try {
    // Verify organization exists
    const organization = await prisma.organization.findUnique({
      where: { id: parseInt(organizationId) },
    });
    if (!organization) {
      console.error(`Borrower Organization not found: organizationId ${organizationId}`);
      return res.status(404).json({ error: 'Borrower Organization not found' });
    }

    // Tenant scoping
    if (organization.tenantId !== tenantId) {
      console.error(`Access denied: User tenantId ${tenantId} does not match organization tenantId ${organization.tenantId}`);
      return res.status(403).json({ error: 'You can only update organizations in your tenant' });
    }

    // Update organization
    const updatedOrganization = await prisma.organization.update({
      where: { id: parseInt(organizationId) },
      data: {
        name: name || organization.name,
        approvalSteps: approvalSteps || organization.approvalSteps,
        loanLimitMultiplier: loanLimitMultiplier || organization.loanLimitMultiplier,
        interestRate: interestRate !== undefined ? interestRate : organization.interestRate,
      },
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: 'UPDATE_BORROWER_ORGANIZATION',
        resource: 'Organization',
        details: {
          organizationId,
          changes: {
            name,
            approvalSteps,
            loanLimitMultiplier,
            interestRate,
          },
        },
      },
    });

    console.log(`Borrower Organization updated: organizationId ${organizationId}`);
    res.status(200).json({ message: 'Borrower Organization updated successfully', organization: updatedOrganization });
  } catch (error) {
    console.error('Failed to update Borrower Organization:', error.message);
    res.status(500).json({ error: 'Failed to update Borrower Organization', details: error.message });
  } finally {
    await prisma.$disconnect();
  }
};




const getBorrowerOrganizations = async (req, res) => {
  const { tenantId } = req.query;

  try {
    // Tenant scoping
    if (tenantId && parseInt(tenantId) !== req.user.tenantId) {
      console.error(`Access denied: User tenantId ${req.user.tenantId} does not match requested tenantId ${tenantId}`);
      return res.status(403).json({ error: 'You can only view organizations in your tenant' });
    }

    const organizations = await prisma.organization.findMany({
      where: { tenantId: parseInt(tenantId) },
      include: { tenant: true },
    });

    console.log(`Fetched ${organizations.length} Borrower Organizations for tenantId ${tenantId}`);
    res.status(200).json({ organizations });
  } catch (error) {
    console.error('Failed to fetch Borrower Organizations:', error.message);
    res.status(500).json({ error: 'Failed to fetch Borrower Organizations' });
  }
};



const deleteBorrowerOrganization = async (req, res) => {
  const { organizationId } = req.params;

  try {
    const organization = await prisma.organization.findUnique({
      where: { id: parseInt(organizationId) },
    });
    if (!organization) {
      console.error(`Borrower Organization not found: organizationId ${organizationId}`);
      return res.status(404).json({ error: 'Borrower Organization not found' });
    }

    // Tenant scoping
    if (organization.tenantId !== req.user.tenantId) {
      console.error(`Access denied: User tenantId ${req.user.tenantId} does not match organization tenantId ${organization.tenantId}`);
      return res.status(403).json({ error: 'You can only delete organizations in your tenant' });
    }

    await prisma.organization.delete({
      where: { id: parseInt(organizationId) },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: organization.tenantId,
        userId: req.user.id,
        action: 'DELETE_BORROWER_ORGANIZATION',
        resource: 'Organization',
        details: { organizationId, name: organization.name },
      },
    });

    console.log(`Borrower Organization deleted: organizationId ${organizationId}`);
    res.status(200).json({ message: 'Borrower Organization deleted successfully' });
  } catch (error) {
    console.error('Failed to delete Borrower Organization:', error.message);
    res.status(500).json({ error: 'Failed to delete Borrower Organization' });
  }
};



const getOrganizations = async (req, res) => {
  try {
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID is required' });
    }

    const organizations = await prisma.organization.findMany({
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

    const data = organizations.map((org) => {
      const totalLoanAmount = org.loans.reduce((sum, loan) => sum + loan.amount, 0);
      const approvedLoanAmount = org.loans
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
  } catch (error) {
    console.error('Error fetching organizations:', error);
    res.status(500).json({ message: 'Failed to fetch organization stats' });
  }
};



const getOrganizationById = async (req, res, next) => {
  try {
    const orgId = parseInt(req.params.orgId, 10);
    if (isNaN(orgId)) {
      return res.status(400).json({ error: 'Invalid organization ID' });
    }

    const { tenantId } = req.user;   // set by your verifyToken middleware

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
      return res.status(404).json({ error: 'Organization not found' });
    }

    res.json(organization);
  } catch (err) {
    next(err);
  }
};


const updateOrganization = async (req, res, next) => {
  try {
    const orgId = parseInt(req.params.id, 10);
    if (isNaN(orgId)) {
      return res.status(400).json({ error: 'Invalid organization ID' });
    }

    const { tenantId } = req.user; // from your auth middleware
    const { name, approvalSteps, loanLimitMultiplier, interestRate } = req.body;

    // Step 1: Check organization exists and belongs to tenant
    const existingOrg = await prisma.organization.findFirst({
      where: { id: orgId, tenantId },
    });

    if (!existingOrg) {
      return res.status(404).json({ error: 'Organization not found or unauthorized' });
    }

    // Step 2: Build update data object with validation
    const updateData = {};

    if (name) updateData.name = name.trim();

    if (approvalSteps !== undefined) {
      const steps = Number(approvalSteps);
      if (!Number.isInteger(steps) || steps < 0) {
        return res.status(400).json({ error: 'Approval steps must be a non-negative integer' });
      }
      updateData.approvalSteps = steps;
    }

    if (loanLimitMultiplier !== undefined) {
      const multiplier = Number(loanLimitMultiplier);
      if (isNaN(multiplier) || multiplier <= 0) {
        return res.status(400).json({ error: 'Loan limit multiplier must be a positive number' });
      }
      updateData.loanLimitMultiplier = multiplier;
    }

    if (interestRate !== undefined) {
      const rate = Number(interestRate);
      if (isNaN(rate) || rate < 0) {
        return res.status(400).json({ error: 'Interest rate must be a non-negative number' });
      }
      updateData.interestRate = rate;
    }

    // Step 3: Update the organization
    const updatedOrg = await prisma.organization.update({
      where: { id: orgId },
      data: updateData,
    });

    res.status(200).json({ message: 'Organization updated successfully', organization: updatedOrg });
  } catch (err) {
    console.error('Error updating organization:', err);
    next(err);
  }
};






// Create an organization admin (tenant admin only)




// Mock SMS sending
const sendSMS = async (phoneNumber, message) => {
  console.log(`SMS to ${phoneNumber}: ${message}`);
};




const getOrganizationAdmins = async (req, res) => {
  try {
    const {tenantId} = req.user;

    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID required' });
    }

    const admins = await prisma.user.findMany({
      where: {
        tenantId,
        role: {
          has: 'ORG_ADMIN', // Matches array roles containing 'ORG_ADMIN'
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
  } catch (error) {
    console.error('Error fetching ORG_ADMINs:', error);
    res.status(500).json({ message: 'Failed to fetch organization admins' });
  }
};




module.exports = {
  createBorrowerOrganization,
  getBorrowerOrganizations,
  updateBorrowerOrganization,
  deleteBorrowerOrganization,
  updateOrganization,
  getOrganizations,getOrganizationAdmins,searchOrganizations,getOrganizationById
};