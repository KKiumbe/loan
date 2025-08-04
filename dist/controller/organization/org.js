"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrganizationAdmins = exports.updateOrganization = exports.getOrganizationById = exports.getOrganizations = exports.deleteBorrowerOrganization = exports.getBorrowerOrganizations = exports.updateBorrowerOrganization = exports.searchOrganizations = exports.createBorrowerOrganization = exports.OrganizationBodySchema = void 0;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const prisma = new client_1.PrismaClient();
// Define the schema for the request body (replacing OrganizationBody)
exports.OrganizationBodySchema = zod_1.z.object({
    name: zod_1.z.string().min(1, 'Organization name is required'),
    approvalSteps: zod_1.z.number().int().positive().optional(),
    loanLimitMultiplier: zod_1.z.number().positive().optional(),
    interestRate: zod_1.z.number().nonnegative().optional(),
});
const createBorrowerOrganization = async (req, res) => {
    const { name, approvalSteps, loanLimitMultiplier, interestRate, interestRateType, dailyInterestRate, baseInterestRate } = req.body;
    const { tenantId, id: userId } = req.user;
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
    }
    catch (error) {
        console.error('Failed to create Borrower Organization:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.createBorrowerOrganization = createBorrowerOrganization;
// Mock SMS sending function
const sendSMS = async (phoneNumber, message) => {
    console.log(`SMS to ${phoneNumber}: ${message}`);
};
// Create a borrower organization
const searchOrganizations = async (req, res) => {
    try {
        // Ensure auth middleware ran
        if (!req.user?.id) {
            console.error('No user in request. Authentication middleware missing or failed.');
            res.status(401).json({ message: 'Authentication required' });
            return;
        }
        // Extract or lookup tenantId
        let tenantId = req.user.tenantId ?? 0;
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
        const take = Math.min(parseInt(limit, 10) || 20, 100);
        const skip = Math.max((parseInt(page, 10) - 1) * take, 0);
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
        const organizations = orgs.map((o) => ({
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
    }
    catch (error) {
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
exports.searchOrganizations = searchOrganizations;
// Update a borrower organization
const updateBorrowerOrganization = async (req, res) => {
    const { organizationId } = req.params;
    const { name, approvalSteps, loanLimitMultiplier, interestRate } = req.body;
    const { tenantId, id: userId } = req.user; // Non-null assertion since verifyToken ensures req.user exists
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
    try {
        // Verify organization exists
        const organization = await prisma.organization.findUnique({
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
        const processedInterestRate = interestRate !== undefined ? interestRate / 100 : 0.1;
        const processLoanMultiplier = loanLimitMultiplier !== undefined ? loanLimitMultiplier / 100 : 1.0;
        // Update organization
        const updatedOrganization = await prisma.organization.update({
            where: { id: parseInt(organizationId) },
            data: {
                name: name ?? organization.name,
                approvalSteps: approvalSteps ?? organization.approvalSteps,
                loanLimitMultiplier: processLoanMultiplier,
                interestRate: processedInterestRate,
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
    }
    catch (error) {
        console.error('Failed to update Borrower Organization:', error.message);
        res.status(500).json({
            error: 'Failed to update Borrower Organization',
            details: error.message,
        });
    }
};
exports.updateBorrowerOrganization = updateBorrowerOrganization;
// Get borrower organizations
const getBorrowerOrganizations = async (req, res) => {
    const { tenantId: queryTenantId } = req.user;
    const { tenantId: userTenantId } = req.user;
    try {
        // Tenant scoping
        if (queryTenantId !== userTenantId) {
            console.error(`Access denied: User tenantId ${userTenantId} does not match requested tenantId ${queryTenantId}`);
            res.status(403).json({ error: 'You can only view organizations in your tenant' });
            return;
        }
        const organizations = await prisma.organization.findMany({
            where: { tenantId: queryTenantId || userTenantId },
            include: { tenant: true },
        });
        console.log(`Fetched ${organizations.length} Borrower Organizations for tenantId ${queryTenantId || userTenantId}`);
        res.status(200).json({ organizations });
    }
    catch (error) {
        console.error('Failed to fetch Borrower Organizations:', error.message);
        res.status(500).json({ error: 'Failed to fetch Borrower Organizations' });
    }
};
exports.getBorrowerOrganizations = getBorrowerOrganizations;
// Delete a borrower organization
const deleteBorrowerOrganization = async (req, res) => {
    const { organizationId } = req.params;
    const { tenantId, id: userId } = req.user;
    try {
        // Verify organization exists
        const organization = await prisma.organization.findUnique({
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
    }
    catch (error) {
        console.error('Failed to delete Borrower Organization:', error.message);
        res.status(500).json({ error: 'Failed to delete Borrower Organization' });
    }
};
exports.deleteBorrowerOrganization = deleteBorrowerOrganization;
// Get organizations with stats
const getOrganizations = async (req, res) => {
    const tenantId = req.user?.tenantId;
    try {
        if (!tenantId) {
            res.status(400).json({ message: 'Tenant ID is required' });
            return;
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
    }
    catch (error) {
        console.error('Error fetching organizations:', error);
        res.status(500).json({ message: 'Failed to fetch organization stats' });
    }
};
exports.getOrganizations = getOrganizations;
// Get organization by ID
const getOrganizationById = async (req, res, next) => {
    try {
        const orgId = parseInt(req.params.orgId, 10);
        if (isNaN(orgId)) {
            res.status(400).json({ error: 'Invalid organization ID' });
            return;
        }
        const { tenantId } = req.user;
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
        res.json(organization);
    }
    catch (error) {
        next(error);
    }
};
exports.getOrganizationById = getOrganizationById;
// Update an organization
const updateOrganization = async (req, res, next) => {
    try {
        const orgId = parseInt(req.params.id, 10);
        if (isNaN(orgId)) {
            res.status(400).json({ error: 'Invalid organization ID' });
            return;
        }
        const { tenantId } = req.user;
        const { name, approvalSteps, loanLimitMultiplier, interestRate, interestRateType, dailyInterestRate, baseInterestRate } = req.body;
        const existingOrg = await prisma.organization.findFirst({
            where: { id: orgId, tenantId },
        });
        if (!existingOrg) {
            res.status(404).json({ error: 'Organization not found or unauthorized' });
            return;
        }
        const updateData = {};
        if (name)
            updateData.name = name.trim();
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
    }
    catch (error) {
        console.error('Error updating organization:', error);
        next(error);
    }
};
exports.updateOrganization = updateOrganization;
// Get organization admins
const getOrganizationAdmins = async (req, res) => {
    const { tenantId } = req.user;
    try {
        if (!tenantId) {
            res.status(400).json({ message: 'Tenant ID required' });
            return;
        }
        const admins = await prisma.user.findMany({
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
    }
    catch (error) {
        console.error('Error fetching ORG_ADMINs:', error);
        res.status(500).json({ message: 'Failed to fetch organization admins' });
    }
};
exports.getOrganizationAdmins = getOrganizationAdmins;
