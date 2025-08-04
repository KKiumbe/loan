"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLoansByStatus = exports.getLoansByOrganization = exports.getAllLoansWithDetails = exports.getCurrentMonthLoanStats = exports.getUserLoans = exports.getPendingLoans = exports.getPendingLoanRequests = exports.getLoanById = exports.getLoans = exports.calculateLoanDetails = void 0;
const client_1 = require("@prisma/client");
const role_1 = __importDefault(require("../../DatabaseConfig/role"));
const date_fns_1 = require("date-fns");
const prisma = new client_1.PrismaClient();
// Helper Functions
const calculateLoanDetails = (amount, interestRate, interestRateType = 'MONTHLY', loanDurationDays = 30, baseInterestRate, dailyInterestRate) => {
    if (!amount || isNaN(amount) || amount <= 0) {
        throw new Error('Invalid loan amount');
    }
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + loanDurationDays);
    let totalRepayable;
    let appliedInterestRate;
    if (interestRateType === 'DAILY') {
        if (!dailyInterestRate || isNaN(dailyInterestRate) || dailyInterestRate <= 0) {
            throw new Error('Invalid daily interest rate');
        }
        const calculatedInterest = dailyInterestRate * loanDurationDays;
        appliedInterestRate =
            baseInterestRate && calculatedInterest < baseInterestRate
                ? baseInterestRate
                : calculatedInterest;
        totalRepayable = amount * (1 + appliedInterestRate);
    }
    else {
        appliedInterestRate = interestRate;
        totalRepayable = amount * (1 + appliedInterestRate);
    }
    if (isNaN(totalRepayable)) {
        throw new Error('Failed to calculate total repayable');
    }
    return { dueDate, totalRepayable, appliedInterestRate, loanDurationDays };
};
exports.calculateLoanDetails = calculateLoanDetails;
;
const getLoans = async (req, res) => {
    const { id: userId, tenantId, role, firstName, lastName } = req.user;
    try {
        if (!role.some((r) => role_1.default[r]?.loan?.includes('read'))) {
            res.status(403).json({ message: 'Unauthorized to view loans' });
            return;
        }
        let loans = [];
        if (role.includes('EMPLOYEE')) {
            loans = await prisma.loan.findMany({
                where: { userId, tenantId },
                include: {
                    user: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            phoneNumber: true,
                        },
                    },
                    organization: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
            });
        }
        else if (role.includes('ORG_ADMIN')) {
            const employee = await prisma.employee.findFirst({
                where: { id: tenantId },
                select: { organizationId: true },
            });
            if (!employee) {
                res.status(404).json({ message: 'Employee not found' });
                return;
            }
            loans = await prisma.loan.findMany({
                where: { organizationId: employee.organizationId, tenantId },
                include: {
                    user: { select: { id: true, firstName: true, lastName: true, phoneNumber: true } },
                    organization: {
                        select: {
                            id: true,
                            name: true,
                            approvalSteps: true,
                            loanLimitMultiplier: true,
                            interestRate: true,
                        },
                    },
                    consolidatedRepayment: true,
                },
            });
        }
        else if (role.includes('ADMIN')) {
            loans = await prisma.loan.findMany({
                where: { tenantId },
                include: {
                    user: { select: { id: true, firstName: true, lastName: true, phoneNumber: true } },
                    organization: {
                        select: {
                            id: true,
                            name: true,
                            approvalSteps: true,
                            loanLimitMultiplier: true,
                            interestRate: true,
                        },
                    },
                    consolidatedRepayment: true,
                },
            });
        }
        else {
            res.status(403).json({ message: 'Unauthorized to view loans' });
            return;
        }
        await prisma.auditLog.create({
            data: {
                tenant: { connect: { id: tenantId } },
                user: { connect: { id: userId } },
                action: 'READ',
                resource: 'LOAN',
                details: JSON.stringify({
                    loanCount: loans.length,
                    user: `${firstName} ${lastName}`,
                }),
            },
        });
        res.status(200).json({ message: 'Loans retrieved successfully' });
        return;
    }
    catch (error) {
        console.error('Error fetching loans:', error);
        res.status(500).json({ message: 'Internal server error', error: error.message });
        return;
    }
    finally {
        await prisma.$disconnect();
    }
};
exports.getLoans = getLoans;
// Get a specific loan by ID
const getLoanById = async (req, res) => {
    const { id } = req.params;
    const { id: userId, tenantId, role } = req.user;
    try {
        if (!id) {
            res.status(400).json({ message: 'Loan ID is required' });
            return;
        }
        if (!role.some((r) => role_1.default[r]?.loan?.includes('read'))) {
            res.status(403).json({ message: 'Unauthorized to view loans' });
            return;
        }
        const loan = await prisma.loan.findUnique({
            where: { id: parseInt(id) },
            include: {
                user: true,
                organization: true,
                consolidatedRepayment: true
            },
        });
        if (!loan) {
            res.status(404).json({ message: 'Loan not found' });
            return;
        }
        if (role.includes('EMPLOYEE') && loan.userId !== userId) {
            res.status(403).json({ message: 'Unauthorized to view this loan' });
            return;
        }
        else if (role.includes('ORG_ADMIN')) {
            const employee = await prisma.employee.findFirst({
                where: { id: tenantId },
                select: { organizationId: true },
            });
            if (!employee || loan.organizationId !== employee.organizationId) {
                res.status(403).json({ message: 'Unauthorized to view this loan' });
                return;
            }
        }
        else if (!role.includes('ADMIN') && loan.tenantId !== tenantId) {
            res.status(403).json({ message: 'Unauthorized to view this loan' });
            return;
        }
        await prisma.auditLog.create({
            data: {
                tenant: { connect: { id: tenantId } },
                user: { connect: { id: userId } },
                action: 'READ',
                resource: 'LOAN',
                details: JSON.stringify({ loanId: loan.id }),
            },
        });
        res.status(200).json({
            success: true,
            error: null,
            message: 'Loan retrieved successfully',
            data: loan
        });
        return;
    }
    catch (error) {
        console.error('Error fetching loan:', error);
        res.status(500).json({ message: 'Internal server error', error: error.message });
        return;
    }
};
exports.getLoanById = getLoanById;
// Get pending loan requests
const getPendingLoanRequests = async (req, res) => {
    const { tenantId } = req.user;
    try {
        if (!tenantId) {
            res.status(400).json({ message: 'Tenant ID is required' });
            return;
        }
        const loans = await prisma.loan.findMany({
            where: { tenantId, status: 'PENDING' },
            include: {
                user: true,
                organization: true,
                consolidatedRepayment: true,
            },
        });
        res.status(200).json({
            success: true,
            error: null,
            message: loans.length === 0 ? 'No pending loans found' : 'Pending loans retrieved successfully',
            data: loans,
        });
    }
    catch (error) {
        console.error('Error fetching pending loan requests:', error);
        res.status(500).json({ message: 'Failed to fetch pending loan requests', error: error.message });
        return;
    }
    finally {
        await prisma.$disconnect();
    }
};
exports.getPendingLoanRequests = getPendingLoanRequests;
// export const getLoansGroupedByStatus = async (
//   req: AuthenticatedRequest,
//   res: Response<ApiResponse<LoanStatus, Loan[]> | ErrorResponse>,
//   next: NextFunction
// ): Promise<void> => {
//   const { tenantId } = req.user!;
//   if (!tenantId) {
//     res.status(400).json({ message: 'Tenant ID is required' });
//     return;
//   }
//   try {
//     const statuses: LoanStatus[] = ['PENDING', 'APPROVED', 'DISBURSED', 'REJECTED'];
//     const loanResults = await Promise.all(
//       statuses.map((status) =>
//         prisma.loan.findMany({
//           where: { tenantId, status },
//           select: {
//             user: true,
//             organization: true,
//             consolidatedRepayment: true,
//             LoanPayout: true,
//           },
//           orderBy: { createdAt: 'desc' },
//         })
//       )
//     );
//     if (loanResults.length > 0) {
//   const loanStatuses = await prisma.loan.findMany({
//   select: {
//     status: true,
//   },
//   distinct: ['status'],
// });
// const groupedLoans: Record<string, Loan[]> = Object.fromEntries(
//   loanStatuses.map((status) => [status.status, []])
// );
//       res.status(200).json({
//         message: 'Loans grouped by status retrieved successfully',
//         data: groupedLoans,
//       });
//     } else {
//       res.status(200).json({
//         message: 'No loans found',
//         data: groupedLoans,
//       });
//     }
//   } catch (error: unknown) {
//     console.error('Error fetching grouped loans:', error);
//     res.status(500).json({
//       message: 'Failed to fetch loans grouped by status',
//       error: (error as Error).message,
//     });
//   }
// };
const getPendingLoans = async (req, res, next) => {
    const { role, tenantId } = req.user;
    try {
        // Validate tenantId
        if (!tenantId) {
            res.status(400).json({ message: 'Tenant ID is required' });
            return;
        }
        // Restrict access to ADMIN role
        if (!role.includes('ADMIN')) {
            res.status(403).json({ message: 'Access denied. Admin role required.' });
            return;
        }
        // Fetch pending loans
        const loans = await prisma.loan.findMany({
            where: {
                status: 'PENDING',
                tenantId,
            },
            include: {
                user: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        phoneNumber: true,
                    },
                },
                organization: {
                    select: {
                        id: true,
                        name: true,
                        approvalSteps: true,
                        loanLimitMultiplier: true,
                        interestRate: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
        res.status(200).json({
            message: 'Pending loans retrieved successfully',
            data: loans,
        });
    }
    catch (error) {
        console.error('Error fetching pending loans:', error);
        res.status(500).json({
            message: 'Internal server error',
            error: error.message,
        });
    }
    // No need for finally block unless in a serverless environment
};
exports.getPendingLoans = getPendingLoans;
// Get user loans
const getUserLoans = async (req, res) => {
    const { id: userId } = req.user;
    try {
        const loans = await prisma.loan.findMany({
            where: { userId },
            include: {
                user: true,
                organization: true,
                consolidatedRepayment: {
                    select: {
                        id: true,
                        organizationId: true,
                        tenantId: true,
                    },
                },
            },
        });
        const grouped = {
            pending: loans.filter((loan) => loan.status === 'PENDING' || loan.status === 'APPROVED'),
            disbursed: loans.filter((loan) => loan.status === 'DISBURSED'),
            rejected: loans.filter((loan) => loan.status === 'REJECTED'),
        };
        res.status(200).json({ message: 'User loans retrieved successfully', data: grouped });
    }
    catch (error) {
        console.error('Error fetching user loans:', error);
        res.status(500).json({ message: 'Could not retrieve loans', error: error.message });
    }
};
exports.getUserLoans = getUserLoans;
const getCurrentMonthLoanStats = async (req, res) => {
    const { role, tenantId, organizationId } = req.user;
    try {
        // Validate tenantId
        if (!tenantId) {
            res.status(400).json({ message: 'Tenant ID is required' });
        }
        // Restrict access to ADMIN or ORG_ADMIN roles
        if (!role.includes('ADMIN') && !role.includes('ORG_ADMIN')) {
            res.status(403).json({ message: 'Access denied. Admin or Org Admin role required.' });
        }
        // Validate organizationId for ORG_ADMIN
        if (role.includes('ORG_ADMIN') && !organizationId) {
            res.status(400).json({ message: 'Organization context missing' });
        }
        // Set date range for current month (Africa/Nairobi timezone)
        const now = new Date().toLocaleString('en-US', { timeZone: 'Africa/Nairobi' });
        const start = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1);
        const end = new Date(new Date(now).getFullYear(), new Date(now).getMonth() + 1, 1);
        // Base filter (exclude organizationId for ADMIN users)
        const baseFilter = {
            tenantId,
            createdAt: { gte: start, lt: end },
        };
        if (role.includes('ORG_ADMIN')) {
            baseFilter.organizationId = organizationId;
        }
        // Fetch stats in a transaction
        const [totalBorrowed, totalPending, totalDisbursed, { _sum }] = await prisma.$transaction([
            prisma.loan.count({ where: baseFilter }),
            prisma.loan.count({ where: { ...baseFilter, status: 'PENDING' } }),
            prisma.loan.count({ where: { ...baseFilter, status: 'DISBURSED' } }),
            prisma.loan.aggregate({ _sum: { amount: true }, where: baseFilter }),
        ]);
        // Log for debugging
        console.log(`Loan stats for tenantId ${tenantId}${role.includes('ORG_ADMIN') ? `, organizationId ${organizationId}` : ''}:`, {
            totalBorrowed,
            totalPending,
            totalDisbursed,
            totalAmountBorrowed: _sum.amount || 0,
        });
        res.status(200).json({
            message: 'Current month loan stats retrieved successfully',
            data: {
                totalBorrowed,
                totalPending,
                totalDisbursed,
                totalAmountBorrowed: _sum.amount || 0,
            },
        });
    }
    catch (error) {
        console.error('Error fetching current-month loan stats:', error);
        res.status(500).json({
            message: 'Internal server error',
            error: error.message,
        });
    }
};
exports.getCurrentMonthLoanStats = getCurrentMonthLoanStats;
const getAllLoansWithDetails = async (req, res) => {
    const { tenantId } = req.user;
    try {
        const loans = await prisma.loan.findMany({
            where: { tenantId }, // 🔐 Multi-tenant filter
            orderBy: { createdAt: 'desc' },
            include: {
                user: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        phoneNumber: true,
                        email: true,
                        employee: {
                            select: {
                                id: true,
                                jobId: true,
                                organization: {
                                    select: { id: true, name: true }
                                }
                            }
                        }
                    },
                },
                organization: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                consolidatedRepayment: {
                    select: {
                        id: true,
                        paidAt: true,
                        status: true,
                    },
                },
                LoanPayout: {
                    select: {
                        id: true,
                        amount: true,
                        status: true,
                        transactionId: true,
                        method: true,
                        createdAt: true,
                    },
                },
            },
        });
        res.status(200).json({
            message: 'Loans retrieved successfully',
            loans,
        });
    }
    catch (error) {
        console.error('Failed to fetch loans:', error.message);
        res.status(500).json({ error: 'Failed to fetch loans' });
    }
};
exports.getAllLoansWithDetails = getAllLoansWithDetails;
const getLoansByOrganization = async (req, res) => {
    const { tenantId } = req.user;
    const { orgId: organizationId } = req.params;
    if (!organizationId) {
        res.status(400).json({ error: 'Missing organizationId' });
        return;
    }
    const orgId = parseInt(organizationId, 10);
    if (isNaN(orgId)) {
        res.status(400).json({ error: 'Invalid organizationId' });
        return;
    }
    try {
        const now = new Date();
        const monthStart = (0, date_fns_1.startOfMonth)(now);
        // 1. All loans for this organization
        const loans = await prisma.loan.findMany({
            where: {
                tenantId,
                organizationId: orgId,
            },
            include: {
                user: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        phoneNumber: true,
                        email: true,
                    },
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
        // 2. Total loans under org
        const totalLoans = await prisma.loan.count({
            where: {
                tenantId,
                organizationId: orgId,
            },
        });
        // 3. Total loans this month
        const loansThisMonth = await prisma.loan.count({
            where: {
                tenantId,
                organizationId: orgId,
                createdAt: {
                    gte: monthStart,
                },
            },
        });
        // 4. Count per status this month
        const statuses = ['PENDING', 'APPROVED', 'REJECTED', 'REPAID', 'DISBURSED'];
        const statusCountsThisMonth = {
            PENDING: 0,
            APPROVED: 0,
            REJECTED: 0,
            REPAID: 0,
            DISBURSED: 0,
        };
        await Promise.all(statuses.map(async (status) => {
            const count = await prisma.loan.count({
                where: {
                    tenantId,
                    organizationId: orgId,
                    createdAt: {
                        gte: monthStart,
                    },
                    status,
                },
            });
            statusCountsThisMonth[status] = count;
        }));
        const disbursed = statusCountsThisMonth.DISBURSED;
        const disbursedPercentageThisMonth = loansThisMonth > 0 ? (disbursed / loansThisMonth) * 100 : 0;
        res.status(200).json({
            loans,
            stats: {
                totalLoans,
                loansThisMonth,
                statusCountsThisMonth,
                disbursedPercentageThisMonth: parseFloat(disbursedPercentageThisMonth.toFixed(2)),
            },
        });
    }
    catch (error) {
        console.error('Error fetching loans by organization:', error.message);
        res.status(500).json({ error: 'Failed to fetch organization loans' });
    }
};
exports.getLoansByOrganization = getLoansByOrganization;
const getLoansByStatus = async (req, res) => {
    const { tenantId } = req.user;
    const statusParam = req.query.status;
    try {
        if (!statusParam || !Object.values(client_1.LoanStatus).includes(statusParam)) {
            res.status(400).json({ error: 'Invalid or missing loan status' });
            return;
        }
        const loans = await prisma.loan.findMany({
            where: {
                status: statusParam,
                tenantId,
            },
            include: {
                user: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        phoneNumber: true,
                        email: true,
                    },
                },
                organization: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
        res.status(200).json({ loans });
    }
    catch (error) {
        console.error('Error fetching loans by status:', error.message);
        res.status(500).json({ error: 'Failed to fetch loans by status' });
    }
};
exports.getLoansByStatus = getLoansByStatus;
