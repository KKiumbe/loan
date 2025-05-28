const { PrismaClient } = require('@prisma/client');
const { getTenantSettings, fetchLatestBalance } = require('./mpesaConfig');
const { getMpesaAccessToken } = require('./token');
const prisma = new PrismaClient();

const axios = require('axios');
require('dotenv').config();

const handleB2CResult = async (req, res) => {
  const result = req.body.Result;
  console.log('M-Pesa B2C Result:', JSON.stringify(result, null, 2));

  // Validate payload: must include either ConversationID or OriginatorConversationID
  if (!result || (!result.ConversationID && !result.OriginatorConversationID) || result.ResultCode === undefined) {
    console.error('Invalid B2C result payload:', req.body);
    return res.status(400).json({ message: 'Invalid payload' });
  }

  try {
    // Use ConversationID if present, otherwise OriginatorConversationID from callback
    const transactionId = result.ConversationID || result.OriginatorConversationID;
    const status = result.ResultCode === 0 ? 'SUCCESS' : 'FAILED';

    // Fetch loan by mpesaTransactionId
    console.time('loanResultQuery');
    const loan = await prisma.loan.findFirst({
      where: { mpesaTransactionId: transactionId },
      select: { id: true, tenantId: true, userId: true },
    });
    console.timeEnd('loanResultQuery');

    if (!loan) {
      console.error('No loan found for transactionId:', transactionId);
      return res.status(404).json({ message: 'Loan not found for transaction' });
    }

    // Update loan status
    console.time('loanResultUpdateQuery');
    await prisma.loan.updateMany({
      where: { mpesaTransactionId: transactionId },
      data: { mpesaStatus: status },
    });
    console.timeEnd('loanResultUpdateQuery');

    // Log the result with OriginatorConversationID
    console.time('auditLogResultQuery');
    await prisma.auditLog.create({
      data: {
        tenant: { connect: { id: loan.tenantId } },
        user: { connect: { id: loan.userId } },
        action: 'MPESA_B2C_RESULT',
        resource: 'LOAN',
        details: {
          loanId: loan.id,
          transactionId,
          originatorConversationId: result.OriginatorConversationID,
          resultCode: result.ResultCode,
          resultDesc: result.ResultDesc || result.errorMessage,
          message: `B2C transaction ${transactionId} ${status}`,
        },
      },
    });
    console.timeEnd('auditLogResultQuery');

    // Optionally fetch account balance after disbursement
    try {
      const settingsRes = await getTenantSettings(loan.tenantId);

      console.log(`this us tenant settings ${JSON.stringify(settingsRes)}`);


      if (settingsRes.success) {
        const cfg = settingsRes.mpesaConfig;
        const accessToken = await getMpesaAccessToken(cfg.consumerKey, cfg.consumerSecret);
    

const balancePayload = {
  Initiator:          cfg.initiatorName,       // field must be “Initiator” not “InitiatorName”
  SecurityCredential: cfg.securityCredential,
  CommandID:          'AccountBalance',
  PartyA:             cfg.b2cShortCode,
  IdentifierType:     '4',
  Remarks:            'OK',
  QueueTimeOutURL:    `${process.env.APP_BASE_URL}/api/accountbalance-timeout`,
  ResultURL:          `${process.env.APP_BASE_URL}/api/accountbalance-result`,
};


        console.log('Sending AccountBalance request:', balancePayload);
        const balRes = await axios.post(
          process.env.MPESA_ACCOUNT_BALANCE_URL,
          balancePayload,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        console.log('M-Pesa AccountBalanceResult:', balRes.data);
      }
    } catch (balErr) {
      console.error('Error invoking account balance query:', balErr);
    }

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

  if (!timeout || (!timeout.ConversationID && !timeout.OriginatorConversationID)) {
    console.error('Invalid B2C timeout payload:', req.body);
    return res.status(400).json({ message: 'Invalid payload' });
  }

  try {
    const transactionId = timeout.ConversationID || timeout.OriginatorConversationID;

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
        user: { connect: { id: loan.userId } },
        action: 'MPESA_B2C_TIMEOUT',
        resource: 'LOAN',
        details: {
          loanId: loan.id,
          transactionId,
          originatorConversationId: timeout.OriginatorConversationID,
          message: 'Transaction timed out',
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



const handleAccountBalanceResult = async (req, res) => {
  const result = req.body.Result;
  console.log('M-Pesa Account Balance Result:', JSON.stringify(result, null, 2));

  try {
    // Parse BOCompletedTime (YYYYMMDDHHMMSS)
    let boCompletedTimeStr = result.ResultParameters.ResultParameter.find(
      (param) => param.Key === 'BOCompletedTime'
    )?.Value;
    
    // Convert to string if number
    boCompletedTimeStr = boCompletedTimeStr ? String(boCompletedTimeStr) : null;
    
    const boCompletedTime = boCompletedTimeStr
      ? new Date(
          `${boCompletedTimeStr.slice(0, 4)}-${boCompletedTimeStr.slice(4, 6)}-${boCompletedTimeStr.slice(6, 8)}T${boCompletedTimeStr.slice(8, 10)}:${boCompletedTimeStr.slice(10, 12)}:${boCompletedTimeStr.slice(12, 14)}`
        )
      : new Date();

    // Parse account balances
    const accountBalanceStr = result.ResultParameters.ResultParameter.find(
      (param) => param.Key === 'AccountBalance'
    )?.Value || '';
    let workingAccountBalance = null;
    let utilityAccountBalance = null;

    if (accountBalanceStr) {
      const accounts = accountBalanceStr.split('&');
      for (const account of accounts) {
        const [accountType, currency, availableBalance] = account.split('|');
        if (accountType === 'Working Account') {
          workingAccountBalance = parseFloat(availableBalance) || null;
        } else if (accountType === 'Utility Account') {
          utilityAccountBalance = parseFloat(availableBalance) || null;
        }
      }
    }

    // Save to MPesaBalance
    await prisma.mPesaBalance.create({
      data: {
        resultType: result.ResultType,
        resultCode: result.ResultCode,
        resultDesc: result.ResultDesc,
        originatorConversationID: result.OriginatorConversationID,
        conversationID: result.ConversationID,
        transactionID: result.TransactionID,
        workingAccountBalance,
        utilityAccountBalance,
      
        tenantId: 1, // Replace with dynamic tenantId (e.g., req.user.tenantId)
      },
    });

    return res.status(200).json({ message: 'Balance result processed' });
  } catch (error) {
    console.error('Error processing balance result:', error);
    return res.status(500).json({ message: 'Error processing balance result' });
  } finally {
    await prisma.$disconnect();
  }
};

const getLatestBalance = async(req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const latest   = await fetchLatestBalance(tenantId);

    if (!latest) {
      return res.status(404).json({ message: 'No balance record found' });
    }
    return res.status(200).json(latest);
  } catch (err) {
    console.error('Error in getLatestBalance:', err);
    return res.status(500).json({ message: 'Failed to fetch latest balance' });
  }
}




/**
 * Handle M-Pesa Account Balance timeout callback
 */
const handleAccountBalanceTimeout = async (req, res) => {
  const timeout = req.body;
  console.log('M-Pesa Account Balance Timeout:', JSON.stringify(timeout, null, 2));

  try {
    return res.status(200).json({ message: 'Balance timeout processed' });
  } catch (err) {
    console.error('Error processing balance timeout:', err);
    return res.status(500).json({ message: 'Error processing balance timeout' });
  } finally {
    await prisma.$disconnect();
  }
};







module.exports = { handleB2CResult, handleB2CTimeout, handleAccountBalanceResult, handleAccountBalanceTimeout,getLatestBalance };