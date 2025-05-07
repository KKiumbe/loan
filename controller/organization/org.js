const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const dotenv = require('dotenv');
const ROLE_PERMISSIONS = require('../../DatabaseConfig/role.js');

dotenv.config();
const prisma = new PrismaClient();



// Create a new borrower organization
const createBorrowerOrganization = async (req, res) => {
  const { name, approvalSteps, loanLimitMultiplier, interestRate } = req.body;
  const { tenantId, id: userId } = req.user;
  console.log('req.user =', req.user); // Add this before destructuring

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

    // Create organization
    const organization = await prisma.organization.create({
      data: {
        name,
        tenantId,
        approvalSteps: approvalSteps || 1,
        loanLimitMultiplier: loanLimitMultiplier || 1.0,
        interestRate: interestRate !== undefined ? interestRate : 0.1, // Default to 10%
      },
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        tenant:{ connect: { id: tenantId } },
        user: { connect: { id: userId } },
        action: 'CREATE_BORROWER_ORGANIZATION',
        resource: 'Organization',
        details: {
          organizationId: organization.id,
          name,
          approvalSteps: approvalSteps || 1,
          loanLimitMultiplier: loanLimitMultiplier || 1.0,
          interestRate: interestRate !== undefined ? interestRate : 0.1,
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






// Create an organization admin (tenant admin only)




// Mock SMS sending
const sendSMS = async (phoneNumber, message) => {
  console.log(`SMS to ${phoneNumber}: ${message}`);
};







module.exports = {
  createBorrowerOrganization,
  getBorrowerOrganizations,
  updateBorrowerOrganization,
  deleteBorrowerOrganization,
};