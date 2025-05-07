const { connect } = require("mongoose");
const ROLE_PERMISSIONS = require("../../DatabaseConfig/role.js");
const { PrismaClient } = require('@prisma/client');
const { disburseB2CPayment } = require("../mpesa/initiateB2CPayment.js");
const prisma = new PrismaClient();


// Helper to calculate due date and total repayable
const calculateLoanDetails = (amount, interestRate) => {
  if (!interestRate || isNaN(interestRate)) {
    throw new Error('Invalid interest rate');
  }
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30); // 30-day loan
  const totalRepayable = amount * (1 + interestRate); // Simple interest for one month
  if (isNaN(totalRepayable)) {
    throw new Error('Failed to calculate total repayable');
  }
  return { dueDate, totalRepayable };
};





// Create a new loan
const createLoan = async (req, res) => {
  const { amount } = req.body;
  const user = req.user;

  console.log(`user: ${JSON.stringify(user, null, 2)}`);

  if (!user || !user.id || !user.tenantId) {
    return res.status(401).json({
      message: 'Unauthorized: User not authenticated or missing required fields',
      userDetails: user,
    });
  }
  if (!user.role.includes('EMPLOYEE')) {
    return res.status(403).json({ message: 'Only employees can apply for loans' });
  }

  if (!amount || amount <= 0) {
    return res.status(400).json({ message: 'Valid loan amount is required' });
  }

  try {
    console.time('existingLoansQuery');
    const existingLoans = await prisma.loan.findMany({
      where: {
        userId: user.id,
        tenantId: user.tenantId,
        status: { in: ['PENDING', 'APPROVED'] },
      },
      select: { id: true, status: true },
    });
    console.timeEnd('existingLoansQuery');

    if (existingLoans.length > 0) {
      return res.status(400).json({
        message: 'Cannot apply for a new loan. You have pending or approved loans.',
        existingLoans,
      });
    }

    console.time('employeeQuery');
    const employee = await prisma.employee.findFirst({
      where: { id: user.employeeId, tenantId: user.tenantId },
      select: {
        id: true,
        grossSalary: true,
        organization: {
          select: {
            id: true,
            interestRate: true,
            loanLimitMultiplier: true,
          },
        },
      },
    });
    console.timeEnd('employeeQuery');

    console.log(`employee: ${JSON.stringify(employee, null, 2)}`);

    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }
    if (!employee.organization) {
      return res.status(404).json({ message: 'Organization not found for employee' });
    }

    const interestRate = employee.organization.interestRate;
    if (!interestRate || isNaN(interestRate)) {
      return res.status(500).json({ message: 'Organization interest rate is invalid' });
    }

    const maxLoanAmount = employee.grossSalary * employee.organization.loanLimitMultiplier;
    if (amount > maxLoanAmount) {
      return res.status(400).json({ message: `Loan amount exceeds limit of ${maxLoanAmount}` });
    }

    const { dueDate, totalRepayable } = calculateLoanDetails(amount, interestRate);

    console.time('loanCreateQuery');
    const newLoan = await prisma.loan.create({
      data: {
        user: { connect: { id: user.id } },
        organization: { connect: { id: employee.organization.id } },
        tenant: { connect: { id: user.tenantId } },
        amount,
        interestRate,
        dueDate,
        totalRepayable,
        status: 'PENDING',
        approvalCount: 0,
      },
    });
    console.timeEnd('loanCreateQuery');

    console.time('auditLogQuery');
    await prisma.auditLog.create({
      data: {
        tenant: { connect: { id: user.tenantId } },
        user: { connect: { id: user.id } },
        action: 'CREATE',
        resource: 'LOAN',
        details: { message: `User ${user.firstName} ${user.lastName} applied for loan of ${amount}` },
      },
    });
    console.timeEnd('auditLogQuery');

    return res.status(201).json({ message: 'Loan application submitted', loan: newLoan });
  } catch (error) {
    console.error('Error creating loan:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  } finally {
    await prisma.$disconnect();
  }
};
// Get loans (scoped by role)
const getLoans = async (req, res) => {
  const user = req.user;

  try {
    let loans;
    if (user.role.includes('EMPLOYEE')) {
      loans = await prisma.loan.findMany({
        where: { userId: user.id, tenantId: user.tenantId },
        include: { organization: { select: { name: true } }, consolidatedRepayment: true },
      });
    } else if (user.role.includes('ORG_ADMIN')) {
      const employee = await prisma.employee.findFirst({
        where: { id: user.employeeId, tenantId: user.tenantId },
        select: { organizationId: true },
      });
      if (!employee) {
        return res.status(404).json({ message: 'Employee not found' });
      }
      loans = await prisma.loan.findMany({
        where: { organizationId: employee.organizationId, tenantId: user.tenantId },
        include: { user: { select: { firstName: true, lastName: true } }, organization: { select: { name: true } }, consolidatedRepayment: true },
      });
    } else if (user.role.includes('ADMIN')) {
      loans = await prisma.loan.findMany({
        where: { tenantId: user.tenantId },
        include: { user: { select: { firstName: true, lastName: true } }, organization: { select: { name: true } }, consolidatedRepayment: true },
      });
    } else {
      return res.status(403).json({ message: 'Unauthorized to view loans' });
    }

    return res.status(200).json({ loans });
  } catch (error) {
    console.error('Error fetching loans:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  } finally {
    await prisma.$disconnect();
  }
};

// Get a specific loan by ID
const getLoanById = async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  try {
    const loan = await prisma.loan.findUnique({
      where: { id: parseInt(id) },
      include: { user: { select: { firstName: true, lastName: true } }, organization: { select: { name: true } }, consolidatedRepayment: true },
    });

    if (!loan) {
      return res.status(404).json({ message: 'Loan not found' });
    }

    if (user.role.includes('EMPLOYEE') && loan.userId !== user.id) {
      return res.status(403).json({ message: 'Unauthorized to view this loan' });
    } else if (user.role.includes('ORG_ADMIN')) {
      const employee = await prisma.employee.findFirst({
        where: { id: user.employeeId, tenantId: user.tenantId },
        select: { organizationId: true },
      });
      if (!employee || loan.organizationId !== employee.organizationId) {
        return res.status(403).json({ message: 'Unauthorized to view this loan' });
      }
    } else if (!user.role.includes('ADMIN') && loan.tenantId !== user.tenantId) {
      return res.status(403).json({ message: 'Unauthorized to view this loan' });
    }

    return res.status(200).json({ loan });
  } catch (error) {
    console.error('Error fetching loan:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  } finally {
    await prisma.$disconnect();
  }
};



const approveLoan = async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  if (!user || !user.id || !user.tenantId) {
    return res.status(401).json({
      message: 'Unauthorized: User not authenticated or missing required fields',
      userDetails: user,
    });
  }
  if (!user.role.includes('ORG_ADMIN') && !user.role.includes('ADMIN')) {
    return res.status(403).json({ message: 'Only ORG_ADMIN or ADMIN can approve loans' });
  }

  try {
    console.time('loanQuery');
    const loan = await prisma.loan.findUnique({
      where: { id: parseInt(id) },
      select: {
        id: true,
        status: true,
        amount: true,
        organizationId: true,
        tenantId: true,
        approvalCount: true,
        firstApproverId: true,
        secondApproverId: true,
       
        user: {
          select: {
            id: true,
            phoneNumber: true,
          },
        },
        organization: {
          select: {
            id: true,
            approvalSteps: true,
          },
        },
      },
    });
    console.timeEnd('loanQuery');

    if (!loan) {
      return res.status(404).json({ message: 'Loan not found' });
    }

    if (loan.status !== 'PENDING') {
      return res.status(400).json({ message: 'Loan is not in PENDING status' });
    }

    if (user.role.includes('ORG_ADMIN')) {
      console.time('employeeQuery');
      const employee = await prisma.employee.findFirst({
        where: { id: user.employeeId, tenantId: user.tenantId },
        select: { organizationId: true },
      });
      console.timeEnd('employeeQuery');

      if (!employee || loan.organizationId !== employee.organizationId) {
        return res.status(403).json({ message: 'Unauthorized to approve this loan' });
      }
    } else if (user.role.includes('ADMIN') && loan.tenantId !== user.tenantId) {
      return res.status(403).json({ message: 'Unauthorized to approve this loan' });
    }

    if (loan.organization.approvalSteps > 1) {
      if (loan.firstApproverId === user.id || loan.secondApproverId === user.id) {
        return res.status(400).json({
          message: 'You have already approved this loan. A different approver is required.',
        });
      }
    }

    const newApprovalCount = loan.approvalCount + 1;
    let updatedLoan;
    let disbursementResult = null;

    if (loan.organization.approvalSteps === 1) {
      console.time('loanUpdateQuery');
      updatedLoan = await prisma.loan.update({
        where: { id: parseInt(id) },
        data: {
          status: 'APPROVED',
          approvalCount: newApprovalCount,
          firstApproverId: user.id,
        },
      });
      console.timeEnd('loanUpdateQuery');

      // Disburse immediately for single-step approval
      if (!loan.disbursedAt) {
        const phoneNumber = loan.user.phoneNumber.startsWith('+254')
          ? loan.user.phoneNumber.replace('+', '')
          : `254${loan.user.phoneNumber.replace(/^0/, '')}`;

        try {
          disbursementResult = await disburseB2CPayment({
            phoneNumber,
            amount: loan.amount,
            loanId: loan.id,
            userId: user.id,
            tenantId: loan.tenantId,
          });
          updatedLoan = disbursementResult.loan;
        } catch (disburseError) {
          console.error('Disbursement failed:', JSON.stringify(disburseError, null, 2));
          // Error is logged in disburseB2CPayment
        }
      }
    } else if (loan.organization.approvalSteps === 2) {
      if (newApprovalCount === 1) {
        console.time('loanUpdateQuery');
        updatedLoan = await prisma.loan.update({
          where: { id: parseInt(id) },
          data: {
            approvalCount: newApprovalCount,
            firstApproverId: user.id,
          },
        });
        console.timeEnd('loanUpdateQuery');
      } else if (newApprovalCount === 2) {
        console.time('loanUpdateQuery');
        updatedLoan = await prisma.loan.update({
          where: { id: parseInt(id) },
          data: {
            status: 'APPROVED',
            approvalCount: newApprovalCount,
            secondApproverId: user.id,
          },
        });
        console.timeEnd('loanUpdateQuery');

        // Disburse immediately for two-step approval
        if (!loan.disbursedAt) {
          const phoneNumber = loan.user.phoneNumber.startsWith('+254')
            ? loan.user.phoneNumber.replace('+', '')
            : `254${loan.user.phoneNumber.replace(/^0/, '')}`;

          try {
            disbursementResult = await disburseB2CPayment({
              phoneNumber,
              amount: loan.amount,
              loanId: loan.id,
              userId: user.id,
              tenantId: loan.tenantId,
            });
            updatedLoan = disbursementResult.loan;
          } catch (disburseError) {
            console.error('Disbursement failed:', JSON.stringify(disburseError, null, 2));
            // Error is logged in disburseB2CPayment
          }
        }
      } else {
        return res.status(400).json({ message: 'Invalid approval count' });
      }
    } else {
      return res.status(500).json({ message: 'Invalid organization approval steps' });
    }

    console.time('auditLogQuery');
    await prisma.auditLog.create({
      data: {
        tenant: { connect: { id: loan.tenantId } },
        user: { connect: { id: user.id } },
        action: 'APPROVE',
        resource: 'LOAN',
        details: {
          loanId: loan.id,
          approvalCount: newApprovalCount,
          message: `Loan ${id} approved by ${user.firstName} ${user.lastName} (Approval ${newApprovalCount}/${loan.organization.approvalSteps})`,
        },
      },
    });
    console.timeEnd('auditLogQuery');

    const response = {
      message:
        loan.organization.approvalSteps === 1 || newApprovalCount === 2
          ? 'Loan fully approved and disbursement initiated'
          : 'Loan partially approved (pending second approval)',
      loan: updatedLoan,
    };

    if (disbursementResult) {
      response.disbursement = {
        message: 'Disbursement successful',
        loan: disbursementResult.loan,
        mpesaResponse: disbursementResult.mpesaResponse,
      };
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error('Error approving loan:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  } finally {
    await prisma.$disconnect();
  }
};


// Reject a loan
const rejectLoan = async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  if (!user.role.includes('ORG_ADMIN') && !user.role.includes('ADMIN')) {
    return res.status(403).json({ message: 'Only ORG_ADMIN or ADMIN can reject loans' });
  }

  try {
    const loan = await prisma.loan.findUnique({
      where: { id: parseInt(id) },
      include: { organization: true },
    });

    if (!loan) {
      return res.status(404).json({ message: 'Loan not found' });
    }

    if (loan.status !== 'PENDING') {
      return res.status(400).json({ message: 'Loan is not in PENDING status' });
    }

    if (user.role.includes('ORG_ADMIN')) {
      const employee = await prisma.employee.findFirst({
        where: { id: user.employeeId, tenantId: user.tenantId },
        select: { organizationId: true },
      });
      if (!employee || loan.organizationId !== employee.organizationId) {
        return res.status(403).json({ message: 'Unauthorized to reject this loan' });
      }
    } else if (user.role.includes('ADMIN') && loan.tenantId !== user.tenantId) {
      return res.status(403).json({ message: 'Unauthorized to reject this loan' });
    }

    const updatedLoan = await prisma.loan.update({
      where: { id: parseInt(id) },
      data: { status: 'REJECTED' },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: loan.tenantId,
        userId: user.id,
        action: 'REJECT',
        resource: 'LOAN',
        details: { message: `Loan ${id} rejected by ${user.firstName} ${user.lastName}` },
      },
    });

    return res.status(200).json({ message: 'Loan rejected', loan: updatedLoan });
  } catch (error) {
    console.error('Error rejecting loan:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  } finally {
    await prisma.$disconnect();
  }
};

// Disburse a loan
const disburseLoan = async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  if (!user || !user.id || !user.tenantId || !user.employeeId) {
    return res.status(401).json({
      message: 'Unauthorized: User not authenticated or missing required fields',
      userDetails: user,
    });
  }
  if (!user.role.includes('ORG_ADMIN') && !user.role.includes('ADMIN')) {
    return res.status(403).json({ message: 'Only ORG_ADMIN or ADMIN can disburse loans' });
  }

  try {
    console.time('loanQuery');
    const loan = await prisma.loan.findUnique({
      where: { id: parseInt(id) },
      select: {
        id: true,
        status: true,
        amount: true,
        organizationId: true,
        tenantId: true,
        disbursedAt: true,
        user: {
          select: {
            id: true,
            phoneNumber: true,
          },
        },
      },
    });
    console.timeEnd('loanQuery');

    if (!loan) {
      return res.status(404).json({ message: 'Loan not found' });
    }

    if (loan.status !== 'APPROVED') {
      return res.status(400).json({ message: 'Loan must be APPROVED to disburse' });
    }

    if (loan.disbursedAt) {
      return res.status(400).json({ message: 'Loan has already been disbursed' });
    }

    if (user.role.includes('ORG_ADMIN')) {
      console.time('employeeQuery');
      const employee = await prisma.employee.findFirst({
        where: { id: user.employeeId, tenantId: user.tenantId },
        select: { organizationId: true },
      });
      console.timeEnd('employeeQuery');

      if (!employee || loan.organizationId !== employee.organizationId) {
        return res.status(403).json({ message: 'Unauthorized to disburse this loan' });
      }
    } else if (user.role.includes('ADMIN') && loan.tenantId !== user.tenantId) {
      return res.status(403).json({ message: 'Unauthorized to disburse this loan' });
    }

    const phoneNumber = loan.user.phoneNumber.startsWith('+254')
      ? loan.user.phoneNumber.replace('+', '')
      : `254${loan.user.phoneNumber.replace(/^0/, '')}`;

    const mpesaResponse = await disburseB2CPayment({
      phoneNumber,
      amount: loan.amount,
    });

    console.time('loanUpdateQuery');
    const updatedLoan = await prisma.loan.update({
      where: { id: parseInt(id) },
      data: {
        disbursedAt: new Date(),
        mpesaTransactionId: mpesaResponse.ConversationID || mpesaResponse.OriginatorConversationID,
        mpesaStatus: mpesaResponse.ResponseCode === '0' ? 'PENDING' : 'FAILED',
      },
    });
    console.timeEnd('loanUpdateQuery');

    console.time('auditLogQuery');
    await prisma.auditLog.create({
      data: {
        tenant: { connect: { id: loan.tenantId } },
        user: { connect: { id: user.id } },
        action: 'DISBURSE',
        resource: 'LOAN',
        details: {
          loanId: loan.id,
          amount: loan.amount,
          phoneNumber,
          mpesaTransactionId: mpesaResponse.ConversationID || mpesaResponse.OriginatorConversationID,
          message: `Loan ${id} disbursed to ${phoneNumber} by ${user.firstName} ${user.lastName}`,
        },
      },
    });
    console.timeEnd('auditLogQuery');

    return res.status(200).json({
      message: 'Loan disbursement initiated',
      loan: updatedLoan,
      mpesaResponse,
    });
  } catch (error) {
    console.error('Error disbursing loan:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  } finally {
    await prisma.$disconnect();
  }
};


// Create a repayment
const createRepayment = async (req, res) => {
  const { loanIds, amount } = req.body;
  const user = req.user;

  if (!user.role.includes('EMPLOYEE')) {
    return res.status(403).json({ message: 'Only employees can make repayments' });
  }

  if (!loanIds || !Array.isArray(loanIds) || loanIds.length === 0 || !amount || amount <= 0) {
    return res.status(400).json({ message: 'Valid loan IDs and amount are required' });
  }

  try {
    const loans = await prisma.loan.findMany({
      where: {
        id: { in: loanIds },
        userId: user.id,
        tenantId: user.tenantId,
        status: { not: 'REPAID' },
      },
    });

    if (loans.length !== loanIds.length) {
      return res.status(400).json({ message: 'Some loans are invalid, not found, or already repaid' });
    }

    const totalRepayable = loans.reduce((sum, loan) => sum + loan.totalRepayable, 0);
    if (amount < totalRepayable) {
      return res.status(400).json({ message: `Repayment amount (${amount}) is less than total repayable (${totalRepayable})` });
    }

    const repayment = await prisma.$transaction(async (prisma) => {
      const newRepayment = await prisma.consolidatedRepayment.create({
        data: {
          userId: user.id,
          organizationId: loans[0].organizationId,
          tenantId: user.tenantId,
          amount,
          paidAt: new Date(),
        },
      });

      await prisma.loan.updateMany({
        where: { id: { in: loanIds } },
        data: {
          consolidatedRepaymentId: newRepayment.id,
          status: 'REPAID',
        },
      });

      return newRepayment;
    });

    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        action: 'CREATE',
        resource: 'REPAYMENT',
        details: { message: `User ${user.firstName} ${user.lastName} repaid ${amount} for loans ${loanIds.join(', ')}` },
      },
    });

    return res.status(201).json({ message: 'Repayment processed', repayment });
  } catch (error) {
    console.error('Error creating repayment:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  } finally {
    await prisma.$disconnect();
  }
};

module.exports = { createLoan, getLoans, getLoanById, approveLoan, rejectLoan, disburseLoan, createRepayment };



