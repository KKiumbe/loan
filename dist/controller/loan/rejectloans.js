"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rejectLoan = void 0;
const client_1 = require("@prisma/client");
const sms_1 = require("../sms/sms");
const prisma = new client_1.PrismaClient();
const rejectLoan = async (req, res, next) => {
    const { id } = req.params;
    const { id: userId, tenantId, role, firstName, lastName } = req.user;
    try {
        if (!id) {
            res.status(400).json({
                success: false,
                message: 'Loan ID is required',
                error: 'Loan ID is required',
            });
            return;
        }
        if (!role.includes('ORG_ADMIN') && !role.includes('ADMIN')) {
            res.status(403).json({
                success: false,
                message: 'Only ORG_ADMIN or ADMIN can reject loans',
                error: 'Forbidden',
            });
            return;
        }
        const loan = await prisma.loan.findUnique({
            where: { id: parseInt(id) },
            include: { organization: { select: { id: true, approvalSteps: true, name: true, loanLimitMultiplier: true, interestRate: true } },
                consolidatedRepayment: true,
                user: true },
        });
        if (!loan) {
            res.status(404).json({
                success: false,
                message: 'Loan not found',
                error: 'Loan not found',
            });
            return;
        }
        if (loan.status !== 'PENDING') {
            res.status(400).json({
                success: false,
                message: `Loan is not in PENDING status, current status: ${loan.status}`,
                error: 'Invalid loan status',
            });
            return;
        }
        if (role.includes('ORG_ADMIN')) {
            const employee = await prisma.employee.findFirst({
                where: { id: userId }, // Fixed: Removed tenantId condition
                select: { organizationId: true },
            });
            if (!employee || loan.organizationId !== employee.organizationId) {
                res.status(403).json({
                    success: false,
                    message: 'Unauthorized to reject this loan',
                    error: 'Forbidden',
                });
                return;
            }
        }
        else if (role.includes('ADMIN') && loan.tenantId !== tenantId) {
            res.status(403).json({
                success: false,
                message: 'Unauthorized to reject this loan',
                error: 'Forbidden',
            });
            return;
        }
        const updatedLoan = await prisma.loan.update({
            where: { id: loan.id },
            data: { status: client_1.LoanStatus.REJECTED },
            include: {
                user: true,
                organization: true,
                consolidatedRepayment: true,
            },
        });
        if (!updatedLoan) {
            res.status(500).json({
                success: false,
                message: 'Failed to update loan',
                error: 'Loan not found after update',
            });
            return;
        }
        // Verify loan limit reversal (recompute takenSoFar to confirm)
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const { _sum } = await prisma.loan.aggregate({
            _sum: { amount: true },
            where: {
                userId: loan.userId,
                tenantId,
                status: { in: ['PENDING', 'APPROVED'] },
                createdAt: { gte: monthStart, lt: monthEnd },
            },
        });
        const takenSoFar = _sum.amount ?? 0;
        // Log audit for rejection
        await prisma.auditLog.create({
            data: {
                tenant: { connect: { id: loan.tenantId } },
                user: { connect: { id: userId } },
                action: 'REJECT',
                resource: 'LOAN',
                details: JSON.stringify({
                    loanId: id,
                    message: `Loan ${id} rejected by ${firstName} ${lastName}`,
                    takenSoFarAfterRejection: takenSoFar,
                }),
            },
        });
        // Send SMS notification to user
        const user = await prisma.user.findUnique({
            where: { id: loan.userId },
            select: { firstName: true, phoneNumber: true },
        });
        const tenant = await prisma.tenant.findUnique({
            where: { id: loan.tenantId },
            select: { name: true },
        });
        if (user) {
            await (0, sms_1.sendSMS)(loan.tenantId, user.phoneNumber, `Dear ${user.firstName}, your loan of KES ${loan.amount} at ${tenant?.name} has been rejected. Contact support for details.`).catch((e) => console.error(`SMS failed: ${e.message}`));
        }
        res.status(200).json({
            success: true,
            message: 'Loan rejected successfully',
            data: updatedLoan,
            error: null,
        });
    }
    catch (error) {
        console.error('Error rejecting loan:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message,
        });
    }
    finally {
        await prisma.$disconnect();
    }
};
exports.rejectLoan = rejectLoan;
