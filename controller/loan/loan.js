const { connect } = require("mongoose");
const ROLE_PERMISSIONS = require("../../DatabaseConfig/role.js");
const { PrismaClient,LoanStatus } = require('@prisma/client');
const { disburseB2CPayment } = require("../mpesa/initiateB2CPayment.js");
const { sendSMS } = require("../sms/sms.js");
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
        disbursedAt: true, // Added to check disbursement status
        user: {
          select: {
            id: true,
            firstName: true,
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
    let loanPayout = null;

    if (loan.organization.approvalSteps === 1) {
      console.time('loanUpdateQuery');
      updatedLoan = await prisma.loan.update({
        where: { id: parseInt(id) },
        data: {
          status: 'APPROVED',
          approvalCount: newApprovalCount,
          firstApproverId: user.id,
        },
        select: {
          id: true,
          status: true,
          amount: true,
          organizationId: true,
          tenantId: true,
          approvalCount: true,
          firstApproverId: true,
          disbursedAt: true,
        },
      });
      console.timeEnd('loanUpdateQuery');

      // Create LoanPayout record for single-step approval
      console.time('loanPayoutCreateQuery');
      loanPayout = await prisma.loanPayout.create({
        data: {
          loanId: loan.id,
          amount: loan.amount,
          method: 'MPESA', // Assuming MPESA as default; adjust as needed
          status: 'PENDING',
          approvedById: user.id,
          tenantId: loan.tenantId,
        },
        select: {
          id: true,
          loanId: true,
          amount: true,
          method: true,
          status: true,
          transactionId: true,
        },
      });
      console.timeEnd('loanPayoutCreateQuery');

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

          console.log(`object disbursementResult: ${JSON.stringify(disbursementResult, null, 2)}`);
  
          // Update LoanPayout with disbursement details
          console.time('loanPayoutUpdateQuery');
          loanPayout = await prisma.loanPayout.update({
            where: { id: loanPayout.id },
            data: {
              transactionId: disbursementResult.mpesaResponse?.transactionId || null,
              status: 'DISBURSED',
            },
            select: {
              id: true,
              loanId: true,
              amount: true,
              method: true,
              status: true,
              transactionId: true,
            },
          });
          console.timeEnd('loanPayoutUpdateQuery');
        } catch (disburseError) {
          console.error('Disbursement failed:', JSON.stringify(disburseError, null, 2));
          // Update LoanPayout to FAILED if disbursement fails
          await prisma.loanPayout.update({
            where: { id: loanPayout.id },
            data: { status: 'FAILED' },
          });
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
          select: {
            id: true,
            status: true,
            amount: true,
            organizationId: true,
            tenantId: true,
            approvalCount: true,
            firstApproverId: true,
            disbursedAt: true,
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
          select: {
            id: true,
            status: true,
            amount: true,
            organizationId: true,
            tenantId: true,
            approvalCount: true,
            secondApproverId: true,
            disbursedAt: true,
          },
        });
        console.timeEnd('loanUpdateQuery');

        // Create LoanPayout record for two-step approval
        console.time('loanPayoutCreateQuery');
        loanPayout = await prisma.loanPayout.create({
          data: {
            loanId: loan.id,
            amount: loan.amount,
            method: 'MPESA', // Assuming MPESA as default; adjust as needed
            status: 'PENDING',
            approvedById: user.id,
            tenantId: loan.tenantId,
          },
          select: {
            id: true,
            loanId: true,
            amount: true,
            method: true,
            status: true,
            transactionId: true,
          },
        });
        console.timeEnd('loanPayoutCreateQuery');

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

            console.log(`this is disbursementResult: ${JSON.stringify(disbursementResult, null, 2)}`);
            updatedLoan = disbursementResult.loan;

            // Update LoanPayout with disbursement details
            console.time('loanPayoutUpdateQuery');
            loanPayout = await prisma.loanPayout.update({
              where: { id: loanPayout.id },
              data: {
                transactionId: disbursementResult.mpesaResponse?.transactionId || null,
                status: 'DISBURSED',
              },
              select: {
                id: true,
                loanId: true,
                amount: true,
                method: true,
                status: true,
                transactionId: true,
              },
            });
            console.timeEnd('loanPayoutUpdateQuery');
          } catch (disburseError) {
            console.error('Disbursement failed:', JSON.stringify(disburseError, null, 2));
            // Update LoanPayout to FAILED if disbursement fails
            await prisma.loanPayout.update({
              where: { id: loanPayout.id },
              data: { status: 'FAILED' },
            });
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
        details: JSON.stringify({
          loanId: loan.id,
          approvalCount: newApprovalCount,
          message: `Loan ${id} approved by ${user.firstName} ${user.lastName} (Approval ${newApprovalCount}/${loan.organization.approvalSteps})`,
        }),
      },
    });
    console.timeEnd('auditLogQuery');

    // Send SMS notification for final approval
    if (updatedLoan.status === 'APPROVED') {
      const tenant = await prisma.tenant.findUnique({
        where: { id: loan.tenantId },
        select: { name: true },
      });
      const welcomeMessage = `Dear ${loan.user.firstName}, your loan of KES ${loan.amount} at ${tenant.name} has been approved. Disbursement initiated. Contact support for queries.`;
      await sendSMS(loan.tenantId, loan.user.phoneNumber, welcomeMessage).catch((error) => {
        console.error(`Failed to send SMS to ${loan.user.phoneNumber}:`, error.message);
        // Continue even if SMS fails
      });
    }

    const response = {
      message:
        loan.organization.approvalSteps === 1 || newApprovalCount === 2
          ? 'Loan fully approved and disbursement initiated'
          : 'Loan partially approved (pending second approval)',
      loan: updatedLoan,
    };

    if (loanPayout) {
      response.loanPayout = {
        message: 'Loan payout record created',
        payout: loanPayout,
      };
    }

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




const createLoan = async (req, res) => {
  try {
    const { amount } = req.body;
    const {
      id: userId,
      tenantId,
      role,
      employeeId, 
      firstName: userFirstName,
      lastName:  userLastName,
      phoneNumber: userPhoneNumber,
    } = req.user;

    // 1. Auth & basic validations
    if (!userId || !tenantId || !employeeId) {
      return res.status(401).json({ message: 'Unauthorized or missing employee link' });
    }
    if (!role.includes('EMPLOYEE')) {
      return res.status(403).json({ message: 'Only employees can apply for loans' });
    }
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Valid loan amount is required' });
    }

    // 2. Load employee + its organization
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { organization: true }
    });
    if (!employee) {
      return res.status(400).json({ message: 'Account not linked to an employee record' });
    }
    const org = employee.organization;
    if (!org) {
      return res.status(500).json({ message: 'Employee has no organization' });
    }

    // 3. Compute monthly cap
    const monthlyCap = employee.grossSalary * org.loanLimitMultiplier;
    const now        = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    // 4. Sum existing PENDING/APPROVED loans
    const { _sum } = await prisma.loan.aggregate({
      _sum: { amount: true },
      where: {
        userId,
        tenantId,
        status:    { in: ['PENDING', 'APPROVED'] },
        createdAt: { gte: monthStart, lt: monthEnd },
      },
    });
    const takenSoFar = _sum.amount ?? 0;
    if (takenSoFar + amount > monthlyCap) {
      return res.status(400).json({
        message: `Cap exceeded. Borrowed KES ${takenSoFar} of KES ${monthlyCap}.`,
        takenSoFar,
        monthlyCap,
      });
    }

    // 5. Create the loan (initially PENDING)
    let loan = await prisma.loan.create({
      data: {
        user:           { connect: { id: userId } },
        organization:   { connect: { id: org.id } },
        tenant:         { connect: { id: tenantId } },
        amount,
        interestRate:   org.interestRate,
        dueDate:        calculateLoanDetails(amount, org.interestRate).dueDate,
        totalRepayable: calculateLoanDetails(amount, org.interestRate).totalRepayable,
        status:         'PENDING',
        approvalCount:  0,
      }
    });

    // 6. Auto-approve & disburse if no approvals needed
    if (org.approvalSteps === 0) {
      // a) mark approved
      loan = await prisma.loan.update({
        where: { id: loan.id },
        data: { status: 'APPROVED' }
      });

      // b) create payout record
      let payout = await prisma.loanPayout.create({
        data: {
          loanId:     loan.id,
          amount:     loan.amount,
          method:     'MPESA',
          status:     'PENDING',
          approvedBy: { connect: { id: userId } },
          tenantId,
        }
      });

      // c) normalize phone for disbursement
      const raw    = userPhoneNumber;
      const msisdn = raw.startsWith('+254') ? raw.slice(1) : raw.replace(/^0/, '254');

      // d) disburse via helper
      try {
        const { loan: disbursedLoan, mpesaResponse } =
          await disburseB2CPayment({
            phoneNumber: msisdn,
            amount:       loan.amount,
            loanId:       loan.id,
            userId,
            tenantId,
          });

        loan   = disbursedLoan;
        payout = await prisma.loanPayout.update({
          where: { id: payout.id },
          data: {
            transactionId: mpesaResponse.transactionId,
            status:        'DISBURSED'
          }
        });
      } catch (err) {
        console.error('Auto-disburse failed:', err);
        await prisma.loanPayout.update({
          where: { id: payout.id },
          data: { status: 'FAILED' }
        });
      }

      // e) audit + notify employee
      await prisma.auditLog.create({
        data: {
          tenant:  { connect: { id: tenantId } },
          user:    { connect: { id: userId } },
          action:   'AUTO_DISBURSE',
          resource: 'LOAN',
          details:  JSON.stringify({ loanId: loan.id, amount }),
        }
      });

      const tenant = await prisma.tenant.findUnique({
        where:  { id: tenantId },
        select: { name: true }
      });
      sendSMS(
        tenantId,
        userPhoneNumber,
        `Dear ${userFirstName}, your KES ${amount} loan at ${tenant?.name} has been auto-approved & disbursed.`
      ).catch(console.error);

      return res.status(201).json({
        message: 'Loan auto-approved & disbursed',
        loan,
        payout
      });
    }

    // 7. Otherwise: notify ORG_ADMIN(s), audit, notify applicant

    // 7a) notify all active ORG_ADMINs in this org
    const orgAdmins = await prisma.user.findMany({
      where: {
        tenantId,
        organizationId: org.id,
        role:           { has: 'ORG_ADMIN' },
        status:         'ACTIVE'
      },
      select: { firstName: true, lastName: true, phoneNumber: true }
    });
    const applicantName = `${userFirstName} ${userLastName}`;
    orgAdmins.forEach(admin => {
      sendSMS(
        tenantId,
        admin.phoneNumber,
        `Hello ${admin.firstName}, new loan request #${loan.id} for KES ${amount} by ${applicantName}. Please review.`
      ).catch(console.error);
    });

    // 7b) audit & notify the borrower
    await prisma.auditLog.create({
      data: {
        tenant:  { connect: { id: tenantId } },
        user:    { connect: { id: userId } },
        action:   'CREATE',
        resource: 'LOAN',
        details:  JSON.stringify({ loanId: loan.id, amount }),
      }
    });
    const tenant = await prisma.tenant.findUnique({
      where:  { id: tenantId },
      select: { name: true }
    });
    sendSMS(
      tenantId,
      userPhoneNumber,
      `Dear ${userFirstName}, your KES ${amount} loan at ${tenant?.name} is pending approval.`
    ).catch(console.error);

    return res.status(201).json({
      message: 'Loan application submitted (pending)',
      loan
    });
  } catch (error) {
    console.error('Error creating loan:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};









// Reject a loan


const rejectLoan = async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  try {
    // Role validation
    if (!user.role.includes('ORG_ADMIN') && !user.role.includes('ADMIN')) {
      console.error(`Access denied: User ${user.id} lacks required role (ORG_ADMIN or ADMIN)`);
      return res.status(403).json({ message: 'Only ORG_ADMIN or ADMIN can reject loans' });
    }

    // Fetch loan with organization
    const loan = await prisma.loan.findUnique({
      where: { id: parseInt(id) },
      include: { organization: true },
    });

    if (!loan) {
      console.error(`Loan not found: id ${id}`);
      return res.status(404).json({ message: 'Loan not found' });
    }

    // Check loan status
    if (loan.status !== 'PENDING') {
      console.error(`Loan ${id} is not in PENDING status: current status ${loan.status}`);
      return res.status(400).json({ message: `Loan is not in PENDING status, current status: ${loan.status}` });
    }

    // Authorization checks
    if (user.role.includes('ORG_ADMIN')) {
      const employee = await prisma.employee.findFirst({
        where: { id: user.employeeId, tenantId: user.tenantId },
        select: { organizationId: true },
      });
      if (!employee) {
        console.error(`Employee not found for user ${user.id}, employeeId ${user.employeeId}`);
        return res.status(403).json({ message: 'Employee profile not found for this user' });
      }
      if (loan.organizationId !== employee.organizationId) {
        console.error(`Unauthorized: User organizationId ${employee.organizationId} does not match loan organizationId ${loan.organizationId}`);
        return res.status(403).json({ message: 'Unauthorized to reject this loan' });
      }
    } else if (user.role.includes('ADMIN') && loan.tenantId !== user.tenantId) {
      console.error(`Unauthorized: Loan tenantId ${loan.tenantId} does not match user tenantId ${user.tenantId}`);
      return res.status(403).json({ message: 'Unauthorized to reject this loan' });
    }

    // Update loan status
    const updatedLoan = await prisma.loan.update({
      where: { id: parseInt(id) },
      data: { status: 'REJECTED' },
    });

    // Log action
    await prisma.auditLog.create({
      data: {
        tenantId: loan.tenantId,
        userId: user.id,
        
        action: 'REJECT_LOAN',
        resource: 'Loan',
        details: {
          loanId: id,
          message: `Loan ${id} rejected by ${user.firstName} ${user.lastName}`,
        },
      },
    });

    console.log(`Loan ${id} rejected by user ${user.id}`);
    return res.status(200).json({ message: 'Loan rejected successfully', loan: updatedLoan });
  } catch (error) {
    console.error(`Error rejecting loan ${id}:`, error.message);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  } finally {
    await prisma.$disconnect();
  }
};
;

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



const getPendingLoanRequests = async (req, res) => {
  try {
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID is required' });
    }

    const loans = await prisma.loan.findMany({
      where: {
        tenantId,
        status: 'PENDING', // Only fetch pending loans
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
      orderBy: { createdAt: 'desc' },
    });

   res.status(200).json({
  data: loans,
  message: loans.length === 0 ? 'No pending loans found' : 'Pending loans retrieved successfully',
});



  } catch (error) {
    console.error('Error fetching pending loan requests:', error);
    res.status(500).json({ message: 'Failed to fetch pending loan requests' });
  }
};





const getLoansGroupedByStatus = async (req, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID is required' });
    }

    const statuses = [
      LoanStatus.PENDING,
      LoanStatus.APPROVED,
      LoanStatus.REJECTED,
      LoanStatus.DISBURSED,
      LoanStatus.REPAID,
    ];

    const loanResults = await Promise.all(
      statuses.map((status) =>
        prisma.loan.findMany({
          where: {
            tenantId,
            status,
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
          orderBy: { createdAt: 'desc' },
        })
      )
    );

    const groupedLoans = {};
    statuses.forEach((status, i) => {
      groupedLoans[status] = loanResults[i];
    });

    res.status(200).json(groupedLoans);
  } catch (error) {
    console.error('Error fetching grouped loans:', error);
    res.status(500).json({ message: 'Failed to fetch loans grouped by status' });
  }
};


const getLoansForAll = async (req, res) => {
  try {
    const { tenantId, role, organizationId } = req.user;
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID is required' });
    }

    // Determine if the user is a full ADMIN
    const isAdmin = role === 'ADMIN';

    const statuses = [
      LoanStatus.PENDING,
      LoanStatus.APPROVED,
      LoanStatus.REJECTED,
      LoanStatus.DISBURSED,
      LoanStatus.REPAID,
    ];

    // Fetch loans per status, adding organization filter when not ADMIN
    const loanResults = await Promise.all(
      statuses.map((status) =>
        prisma.loan.findMany({
          where: {
            tenantId,
            status,
            // if not ADMIN, restrict to their organization
            ...( !isAdmin && organizationId
              ? { organizationId }
              : {}
            ),
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
          orderBy: { createdAt: 'desc' },
        })
      )
    );

    const groupedLoans = {};
    statuses.forEach((status, i) => {
      groupedLoans[status] = loanResults[i];
    });

    return res.status(200).json(groupedLoans);
  } catch (error) {
    console.error('Error fetching grouped loans:', error);
    return res
      .status(500)
      .json({ message: 'Failed to fetch loans grouped by status' });
  }
};




 
const getPendingLoans = async(req, res)=> {
  try {
    const { role = [], tenantId, organizationId } = req.user;

    // Base filter: only PENDING loans for this tenant
    const baseFilter = { status: 'PENDING', tenantId };

    let loans;
    if (role.includes('ADMIN')) {
      // ADMIN sees all pending loans in tenant
      loans = await prisma.loan.findMany({
        where: baseFilter,
        include: {
          user: { select: { id: true, firstName: true, lastName: true } },
          organization: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

    } else if (role.includes('ORG_ADMIN')) {
      // ORG_ADMIN sees only their org’s pending loans
      if (!organizationId) {
        return res.status(400).json({ error: 'Organization context missing' });
      }
      loans = await prisma.loan.findMany({
        where: {
          ...baseFilter,
          organizationId,
        },
        include: {
          user: { select: { id: true, firstName: true, lastName: true } },
          organization: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

    } else {
      return res.status(403).json({ error: 'Access denied' });
    }

    return res.json(loans);

  } catch (error) {
    console.error('Error fetching pending loans:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}





const getUserLoans = async (req, res) => {
  try {
    const userId = req.user.id;           // set by verifyToken middleware
    // fetch all loans for this user, most recent first
    const loans = await prisma.loan.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });

    // group them
    const pending   = [];
    const disbursed = [];
    const rejected  = [];

    for (const loan of loans) {
      switch (loan.status) {
        case LoanStatus.PENDING:
        case LoanStatus.APPROVED: // if you want to show APPROVED in pending bucket, adjust as needed
          pending.push(loan);
          break;
        case LoanStatus.DISBURSED:
          disbursed.push(loan);
          break;
        case LoanStatus.REJECTED:
          rejected.push(loan);
          break;
        default:
          // ignore or handle other statuses (REPAID, etc.)
          break;
      }
    }

    return res.json({
      pending,
      disbursed,
      rejected
    });
  } catch (error) {
    console.error('Error fetching user loans:', error);
    return res.status(500).json({ error: 'Could not retrieve loans' });
  }
};



async function getCurrentMonthLoanStats(req, res) {
  try {
    const { role = [], tenantId, organizationId } = req.user;

    // Compute current month window: [startOfMonth, startOfNextMonth)
    const now   = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end   = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    // Base filter: tenant + createdAt in this month
    const baseFilter = {
      tenantId,
      createdAt: { gte: start, lt: end },
    };

    // ORG_ADMIN: further restrict to their organization
    if (role.includes('ORG_ADMIN')) {
      if (!organizationId) {
        return res.status(400).json({ error: 'Organization context missing.' });
      }
      baseFilter.organizationId = organizationId;

    // Non-ADMIN/ORG_ADMIN: forbidden
    } else if (!role.includes('ADMIN')) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    // In a single transaction: counts + sum
    const [ totalBorrowed, totalPending, totalDisbursed, { _sum } ] =
      await prisma.$transaction([
        prisma.loan.count({ where: baseFilter }),
        prisma.loan.count({ where: { ...baseFilter, status: 'PENDING' } }),
        prisma.loan.count({ where: { ...baseFilter, status: 'DISBURSED' } }),
        prisma.loan.aggregate({ _sum: { amount: true }, where: baseFilter })
      ]);

    return res.json({
      totalBorrowed,
      totalPending,
      totalDisbursed,
      totalAmountBorrowed: _sum.amount || 0
    });

  } catch (error) {
    console.error('Error fetching current-month loan stats:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}













module.exports = { createLoan, getLoans, getLoanById, approveLoan, rejectLoan, disburseLoan, createRepayment,getPendingLoanRequests ,getLoansGroupedByStatus,getUserLoans ,getPendingLoans,getCurrentMonthLoanStats,getLoansForAll};



