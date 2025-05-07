// src/controllers/mpesaController.js
const { prisma } = require('../prisma/prisma-client'); // Adjust path

// Handle M-Pesa B2C result callback
const handleB2CResult = async (req, res) => {
  const result = req.body.Result;
  console.log('M-Pesa B2C Result:', JSON.stringify(result, null, 2));

  try {
    const transactionId = result.ConversationID || result.OriginatorConversationID;
    const status = result.ResultCode === 0 ? 'SUCCESS' : 'FAILED';

    console.time('loanUpdateQuery');
    await prisma.loan.updateMany({
      where: { mpesaTransactionId: transactionId },
      data: { mpesaStatus: status },
    });
    console.timeEnd('loanUpdateQuery');

    // Log the result
    console.time('auditLogQuery');
    await prisma.auditLog.create({
      data: {
        tenantId: 0, // Update with actual tenantId if available
        action: 'MPESA_B2C_RESULT',
        resource: 'LOAN',
        details: {
          transactionId,
          resultCode: result.ResultCode,
          resultDesc: result.ResultDesc,
          message: `M-Pesa B2C transaction ${transactionId} ${status}`,
        },
      },
    });
    console.timeEnd('auditLogQuery');

    return res.status(200).json({ message: 'Result processed' });
  } catch (error) {
    console.error('Error processing B2C result:', error);
    return res.status(500).json({ message: 'Error processing result' });
  } finally {
    await prisma.$disconnect();
  }
};

// Handle M-Pesa B2C timeout callback
const handleB2CTimeout = async (req, res) => {
  const timeout = req.body;
  console.log('M-Pesa B2C Timeout:', JSON.stringify(timeout, null, 2));

  try {
    const transactionId = timeout.ConversationID || timeout.OriginatorConversationID;

    console.time('loanUpdateQuery');
    await prisma.loan.updateMany({
      where: { mpesaTransactionId: transactionId },
      data: { mpesaStatus: 'TIMEOUT' },
    });
    console.timeEnd('loanUpdateQuery');

    // Log the timeout
    console.time('auditLogQuery');
    await prisma.auditLog.create({
      data: {
        tenantId: 0, // Update with actual tenantId if available
        action: 'MPESA_B2C_TIMEOUT',
        resource: 'LOAN',
        details: {
          transactionId,
          message: `M-Pesa B2C transaction ${transactionId} timed out`,
        },
      },
    });
    console.timeEnd('auditLogQuery');

    return res.status(200).json({ message: 'Timeout processed' });
  } catch (error) {
    console.error('Error processing B2C timeout:', error);
    return res.status(500).json({ message: 'Error processing timeout' });
  } finally {
    await prisma.$disconnect();
  }
};

module.exports = { handleB2CResult, handleB2CTimeout };