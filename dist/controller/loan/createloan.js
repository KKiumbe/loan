"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLoan = void 0;
const client_1 = require("@prisma/client");
const getloans_1 = require("./getloans");
const sms_1 = require("../sms/sms");
const mpesaConfig_1 = require("../mpesa/mpesaConfig");
const initiateB2CPayment_1 = require("../mpesa/initiateB2CPayment");
const prisma = new client_1.PrismaClient();
const createLoan = async (req, res) => {
    try {
        const { amount } = req.body;
        const { id: userId, tenantId, role, firstName, lastName, phoneNumber } = req.user;
        if (!userId || !tenantId) {
            res.status(401).json({ message: 'Unauthorized' });
            return;
        }
        if (!role.includes('EMPLOYEE')) {
            res.status(403).json({ message: 'Only employees with loan creation permission can apply for loans' });
            return;
        }
        if (!amount || amount <= 0) {
            res.status(400).json({ message: 'Valid loan amount is required' });
            return;
        }
        const employee = await prisma.employee.findUnique({
            where: { phoneNumber },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                grossSalary: true,
                phoneNumber: true,
                organization: {
                    select: {
                        id: true,
                        name: true,
                        status: true,
                        loanLimitMultiplier: true,
                        interestRate: true,
                        interestRateType: true,
                        dailyInterestRate: true,
                        baseInterestRate: true,
                        approvalSteps: true
                    }
                }
            },
        });
        if (!employee || !employee?.organization) {
            res.status(400).json({ message: 'Employee or organization not found' });
            return;
        }
        if (employee.organization?.status !== 'ACTIVE') {
            res.status(403).json({ message: 'Loan requests are disabled. Your organization is not active.' });
            return;
        }
        const org = employee.organization;
        const monthlyCap = employee.grossSalary * org.loanLimitMultiplier;
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const { _sum } = await prisma.loan.aggregate({
            _sum: { amount: true },
            where: {
                userId,
                tenantId,
                status: { in: ['PENDING', 'APPROVED'] },
                createdAt: { gte: monthStart, lt: monthEnd },
            },
        });
        const takenSoFar = _sum.amount ?? 0;
        if (takenSoFar + amount > monthlyCap) {
            res.status(400).json({
                message: `Cap exceeded. Borrowed KES ${takenSoFar} of KES ${monthlyCap}.`,
            });
            return;
        }
        const { dueDate, totalRepayable, appliedInterestRate, loanDurationDays } = (0, getloans_1.calculateLoanDetails)(amount, org.interestRateType === 'DAILY' ? org.dailyInterestRate : org.interestRate, org.interestRateType, org.baseInterestRate);
        const transactionBand = await prisma.transactionCostBand.findFirst({
            where: {
                tenantId,
                minAmount: { lte: amount },
                maxAmount: { gte: amount },
            },
        });
        const transactionCharge = transactionBand?.cost ?? 0;
        const loan = await prisma.loan.create({
            data: {
                user: { connect: { id: userId } },
                organization: { connect: { id: org.id } },
                tenant: { connect: { id: tenantId } },
                amount,
                interestRate: org.interestRate,
                dueDate,
                totalRepayable,
                transactionCharge,
                status: org.approvalSteps === 0 ? 'APPROVED' : 'PENDING',
                approvalCount: 0,
            },
            include: {
                organization: { select: { id: true, name: true, approvalSteps: true, loanLimitMultiplier: true, interestRate: true, interestRateType: true, baseInterestRate: true, dailyInterestRate: true } },
                user: { select: { id: true, firstName: true, phoneNumber: true, lastName: true } },
                consolidatedRepayment: true,
                LoanPayout: true,
            },
        });
        await prisma.auditLog.create({
            data: {
                tenant: { connect: { id: tenantId } },
                user: { connect: { id: userId } },
                action: 'CREATE',
                resource: 'LOAN',
                details: JSON.stringify({ loanId: loan.id, amount }),
            },
        });
        // === Auto Approval & Disbursement ===
        if (org.approvalSteps === 0) {
            const disbursableLoan = {
                id: loan.id,
                amount: loan.amount,
                tenantId: loan.tenantId,
                disbursedAt: loan.disbursedAt,
                user: {
                    id: loan.user.id,
                    firstName: loan.user.firstName,
                    phoneNumber: loan.user.phoneNumber,
                    lastName: loan.user.lastName
                },
                organization: {
                    id: loan.organization.id,
                    name: loan.organization.name,
                    approvalSteps: loan.organization.approvalSteps,
                    loanLimitMultiplier: loan.organization.loanLimitMultiplier,
                    interestRate: loan.organization.interestRate
                },
            };
            const { loanPayout, disbursement, updatedLoan } = await createPayoutAndDisburse(disbursableLoan, prisma);
            if ('message' in loanPayout) {
                res.status(400).json({
                    success: false,
                    message: 'Loan auto-approved but disbursement failed',
                    data: {
                        loan,
                        loanPayout,
                        disbursement: null
                    },
                    error: 'Disbursement failed'
                });
                return;
            }
            await prisma.auditLog.create({
                data: {
                    tenant: { connect: { id: tenantId } },
                    user: { connect: { id: userId } },
                    action: 'AUTO_APPROVE',
                    resource: 'LOAN',
                    details: JSON.stringify({
                        loanId: loan.id,
                        message: `Loan ${loan.id} auto-approved (0 approval steps required)`,
                    }),
                },
            });
            const tenant = await prisma.tenant.findUnique({
                where: { id: tenantId },
                select: { name: true },
            });
            let interestDescription = '';
            if (org.interestRateType === 'DAILY') {
                interestDescription = `At a daily rate Interest of: ${(appliedInterestRate * 100).toFixed(2)}% for ${loanDurationDays} days`;
            }
            else {
                interestDescription = `Interest: ${(appliedInterestRate * 100).toFixed(2)}% monthly`;
            }
            const dueDateFormatted = dueDate.toLocaleDateString('en-KE', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
            const message = `Dear ${firstName}, your loan of KES ${amount.toLocaleString()} at ${tenant?.name ?? ''} has been auto-approved. ${interestDescription}.SMS and Transaction charges is ${loan.transactionCharge.toLocaleString()} Due date: ${dueDateFormatted}.`;
            await (0, sms_1.sendSMS)(tenantId, phoneNumber, message).catch(err => console.error('SMS error:', err));
            res.status(201).json({
                message: 'Loan auto-approved and disbursement initiated',
                success: true,
                data: {
                    loan,
                    loanPayout,
                    disbursement
                },
                error: null
            });
            return;
        }
        // === Manual Approval Notifications ===
        const applicantName = `${firstName} ${lastName}`;
        // const orgAdmins = await prisma.user.findMany({
        //   where: { tenantId, organizationId: org.id, role: { has: 'ORG_ADMIN' }, status: 'ACTIVE' },
        //   select: { id: true, firstName: true, lastName: true, phoneNumber: true },
        // });
        const [orgAdmins, platformAdmins] = await Promise.all([
            prisma.user.findMany({
                where: {
                    tenantId,
                    organizationId: org.id,
                    role: { has: 'ORG_ADMIN' },
                    status: 'ACTIVE',
                },
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    phoneNumber: true,
                },
            }),
            prisma.user.findMany({
                where: {
                    tenantId,
                    role: { has: 'ADMIN' },
                    status: 'ACTIVE',
                },
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    phoneNumber: true,
                },
            }),
        ]);
        // Merge and deduplicate by user ID
        const notifyUsers = [...orgAdmins, ...platformAdmins].filter((user, index, self) => index === self.findIndex((u) => u.id === user.id));
        await Promise.all(notifyUsers.map((admin) => (0, sms_1.sendSMS)(tenantId, admin.phoneNumber, `Hello ${admin.firstName}, new loan request #${loan.id} for KES ${amount} by ${applicantName}. Please review.`).catch(err => console.error(`Failed to send SMS to ${admin.phoneNumber}:`, err))));
        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { name: true },
        });
        await (0, sms_1.sendSMS)(tenantId, phoneNumber, `Dear ${firstName}, your KES ${amount} loan at ${tenant?.name ?? 'the organization'} is pending approval.`).catch(err => console.error(`Failed to send SMS to ${phoneNumber}:`, err));
        res.status(201).json({
            message: 'Loan created and pending approval',
            success: true,
            data: {
                loan,
                loanPayout: null,
                disbursement: null
            },
            error: null
        });
    }
    catch (error) {
        console.error('Error creating loan:', error);
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
};
exports.createLoan = createLoan;
const createPayoutAndDisburse = async (loan, prisma) => {
    let loanPayout = null;
    let disbursementResult;
    let updatedLoan = null;
    loanPayout = await prisma.loanPayout.create({
        data: {
            loanId: loan.id,
            amount: loan.amount,
            method: 'MPESA',
            status: client_1.PayoutStatus.PENDING,
            approvedById: null,
            tenantId: loan.tenantId,
            transactionId: null,
        },
    });
    if (!loan.disbursedAt) {
        const balanceRecord = await (0, mpesaConfig_1.fetchLatestBalance)(loan.tenantId);
        const availableBalance = balanceRecord?.utilityAccountBalance ?? 0;
        if (availableBalance < loan.amount) {
            await prisma.loanPayout.update({
                where: { id: loanPayout.id },
                data: { status: client_1.PayoutStatus.FAILED },
            });
            await prisma.auditLog.create({
                data: {
                    tenant: { connect: { id: loan.tenantId } },
                    user: { connect: { id: loan.user.id } },
                    action: 'DISBURSEMENT_FAILED',
                    resource: 'LOAN',
                    details: JSON.stringify({ loanId: loan.id, amount: loan.amount, reason: 'Insufficient balance' }),
                },
            });
            const tenant = await prisma.tenant.findUnique({
                where: { id: loan.tenantId },
                select: { name: true },
            });
            await (0, sms_1.sendSMS)(loan.tenantId, loan.user.phoneNumber, `Dear ${loan.user.firstName}, your loan of KES ${loan.amount} at ${tenant?.name} could not be disbursed due to insufficient funds.`).catch(err => console.error('SMS error:', err));
            return {
                loanPayout: { message: 'Payout created but failed due to insufficient balance', payout: loanPayout },
                disbursement: undefined,
                updatedLoan,
            };
        }
        try {
            const formattedPhone = loan.user.phoneNumber.startsWith('+254')
                ? loan.user.phoneNumber.replace('+', '')
                : `254${loan.user.phoneNumber.replace(/^0/, '')}`;
            disbursementResult = await (0, initiateB2CPayment_1.disburseB2CPayment)({
                phoneNumber: formattedPhone,
                amount: loan.amount,
                loanId: loan.id,
                userId: loan.user.id,
                tenantId: loan.tenantId,
            });
            if (!disbursementResult?.mpesaResponse) {
                throw new Error('Disbursement failed: No MPESA response');
            }
            updatedLoan = {
                ...loan,
                disbursedAt: new Date()
            };
            await prisma.loanPayout.update({
                where: { id: loanPayout.id },
                data: {
                    transactionId: disbursementResult.mpesaResponse.transactionId,
                    status: client_1.PayoutStatus.DISBURSED,
                },
            });
        }
        catch (err) {
            await prisma.loanPayout.update({
                where: { id: loanPayout.id },
                data: { status: client_1.PayoutStatus.FAILED },
            });
            await prisma.auditLog.create({
                data: {
                    tenant: { connect: { id: loan.tenantId } },
                    user: { connect: { id: loan.user.id } },
                    action: 'DISBURSEMENT_FAILED',
                    resource: 'LOAN',
                    details: JSON.stringify({ loanId: loan.id, amount: loan.amount, reason: err.message }),
                },
            });
            const tenant = await prisma.tenant.findUnique({
                where: { id: loan.tenantId },
                select: { name: true },
            });
            await (0, sms_1.sendSMS)(loan.tenantId, loan.user.phoneNumber, `Dear ${loan.user.firstName}, your loan of KES ${loan.amount} at ${tenant?.name} could not be disbursed due to an error.`).catch(e => console.error('SMS failed:', e));
            return {
                loanPayout: { message: 'Payout created but failed due to error', payout: loanPayout },
                disbursement: undefined,
                updatedLoan,
            };
        }
    }
    return { loanPayout, disbursement: disbursementResult, updatedLoan };
};
