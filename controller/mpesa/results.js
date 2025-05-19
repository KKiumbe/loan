const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();



/**
 * Handle M-Pesa B2C result callback (ResultURL)
 */
const handleB2CResult = async (req, res) => {
  const result = req.body.Result;
  console.log('M-Pesa B2C Result:', JSON.stringify(result, null, 2));

  if (!result || !result.ConversationID || result.ResultCode === undefined) {
    console.error('Invalid B2C result payload:', req.body);
    return res.status(400).json({ message: 'Invalid payload' });
  }

  try {
    const transactionId = result.ConversationID;
    const status = result.ResultCode === 0 ? 'SUCCESS' : 'FAILED';

    console.time('loanResultQuery');
    const loan = await prisma.loan.findFirst({
      where: { mpesaTransactionId: transactionId },
      select: { id: true, tenantId: true },
    });
    console.timeEnd('loanResultQuery');

    if (!loan) {
      console.error('No loan found for transactionId:', transactionId);
      return res.status(404).json({ message: 'Loan not found for transaction' });
    }

    console.time('loanResultUpdateQuery');
    await prisma.loan.updateMany({
      where: { mpesaTransactionId: transactionId },
      data: { mpesaStatus: status },
    });
    console.timeEnd('loanResultUpdateQuery');

    console.time('auditLogResultQuery');
    await prisma.auditLog.create({
      data: {
        tenant: { connect: { id: loan.tenantId } },
        action: 'MPESA_B2C_RESULT',
        resource: 'LOAN',
        details: {
          loanId: loan.id,
          transactionId,
          resultCode: result.ResultCode,
          resultDesc: result.ResultDesc,
          message: `M-Pesa B2C transaction ${transactionId} ${status}`,
        },
      },
    });
    console.timeEnd('auditLogResultQuery');

    return res.status(200).json({ message: 'Result processed' });
  } catch (error) {
    console.error('Error processing B2C result:', error);
    return res.status(200).json({ message: 'Result received but processing failed' });
  } finally {
    await prisma.$disconnect();
  }
};

/**
 * Handle M-Pesa B2C timeout callback (QueueTimeOutURL)
 */
const handleB2CTimeout = async (req, res) => {
  const timeout = req.body;
  console.log('M-Pesa B2C Timeout:', JSON.stringify(timeout, null, 2));

  if (!timeout || !timeout.ConversationID) {
    console.error('Invalid B2C timeout payload:', req.body);
    return res.status(400).json({ message: 'Invalid payload' });
  }

  try {
    const transactionId = timeout.ConversationID;

    console.time('loanTimeoutQuery');
    const loan = await prisma.loan.findFirst({
      where: { mpesaTransactionId: transactionId },
      select: { id: true, tenantId: true },
    });
    console.timeEnd('loanTimeoutQuery');

    if (!loan) {
      console.error('No loan found for transactionId:', transactionId);
      return res.status(404).json({ message: 'Loan not found for transaction' });
    }

    console.time('loanTimeoutUpdateQuery');
    await prisma.loan.updateMany({
      where: { mpesaTransactionId: transactionId },
      data: { mpesaStatus: 'TIMEOUT' },
    });
    console.timeEnd('loanTimeoutUpdateQuery');

    console.time('auditLogTimeoutQuery');
    await prisma.auditLog.create({
      data: {
        tenant: { connect: { id: loan.tenantId } },
        action: 'MPESA_B2C_TIMEOUT',
        resource: 'LOAN',
        details: {
          loanId: loan.id,
          transactionId,
          message: `M-Pesa B2C transaction ${transactionId} timed out`,
        },
      },
    });
    console.timeEnd('auditLogTimeoutQuery');

    return res.status(200).json({ message: 'Timeout processed' });
  } catch (error) {
    console.error('Error processing B2C timeout:', error);
    return res.status(200).json({ message: 'Timeout received but processing failed' });
  } finally {
    await prisma.$disconnect();
  }
};






module.exports = { handleB2CResult, handleB2CTimeout };