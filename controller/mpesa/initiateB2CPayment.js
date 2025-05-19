// src/utils/mpesaB2C.js
//prismaClient.js

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const axios = require('axios');
const { getMpesaAccessToken } = require('./token');
const { getTenantSettings } = require('./mpesaConfig');

require('dotenv').config();






const initiateB2CPayment = async ({
  amount,
  phoneNumber,
  queueTimeoutUrl,
  resultUrl,
  b2cShortCode,
  initiatorName,
  securityCredential,
  consumerKey,
  consumerSecret,
  remarks = 'Loan Disbursement',
}) => {
  const b2cUrl = process.env.MPESA_B2C_URL;

  if (!b2cUrl || !b2cShortCode || !initiatorName || !securityCredential || !consumerKey || !consumerSecret) {
    throw new Error('Missing M-Pesa B2C configuration');
  }

  if (!amount || amount <= 0) {
    throw new Error('Invalid amount');
  }
  if (!phoneNumber.match(/^2547\d{8}$/)) {
    throw new Error('Invalid phone number format');
  }
  if (!queueTimeoutUrl || !resultUrl) {
    throw new Error('Missing webhook URLs');
  }

  console.log(`this is consumer key and secret`, consumerKey, consumerSecret);
  const accessToken = await getMpesaAccessToken(consumerKey, consumerSecret);

  console.log(`this is the access token`, accessToken);

  if (!accessToken) {
    throw new Error('Failed to fetch M-Pesa access token');
  }

  const payload = {
    InitiatorName: initiatorName,
    SecurityCredential: securityCredential,
    CommandID: 'BusinessPayment',
    Amount: amount,
    PartyA: b2cShortCode,
    PartyB: phoneNumber,
    Remarks: remarks,
    QueueTimeOutURL: queueTimeoutUrl,
    ResultURL: resultUrl,
    Occasion: 'LoanDisbursement',
  };

  console.log(`this is the payload ${JSON.stringify(payload)}`);
  console.log(`this is the b2cUrl ${b2cUrl}`);


try {
  console.time('mpesaB2CQuery');
  const response = await axios.post(b2cUrl, payload, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });
  console.log('Full M-Pesa B2C response:', JSON.stringify(response.data, null, 2));
  console.timeEnd('mpesaB2CQuery');
  return response.data;
} catch (error) {
  console.error('Error initiating B2C payment:', {
    message: error.message,
    response: error.response?.data,
    status: error.response?.status,
    headers: error.response?.headers,
  });
  throw new Error('Failed to initiate B2C payment');
}

};

const disburseB2CPayment = async ({ phoneNumber, amount, loanId, userId, tenantId }) => {
  if (!amount || amount <= 0) {
    throw new Error('Invalid amount');
  }
  if (!phoneNumber.match(/^2547\d{8}$/)) {
    throw new Error('Invalid phone number format');
  }
  if (!loanId || !userId || !tenantId) {
    throw new Error('Missing loanId, userId, or tenantId');
  }

  console.log(`this is the tenantId`, tenantId);

  // Fetch tenant-specific M-Pesa configuration
  console.time('getTenantSettingsQuery');
  const settingsResponse = await getTenantSettings(tenantId);
  
 console.log(`this is the settingsResponse`, settingsResponse);

  if (!settingsResponse.success) {
    throw new Error(settingsResponse.message || 'Failed to fetch tenant M-Pesa settings');
  }

  const mpesaConfig = settingsResponse.mpesaConfig;

  const resultUrl = `${process.env.APP_BASE_URL}/lend/b2c-result`;
  const queueTimeoutUrl = `${process.env.APP_BASE_URL}/lend/b2c-timeout`;

  console.time('mpesaPayment');
  const mpesaResponse = await initiateB2CPayment({
    amount,
    phoneNumber,
    queueTimeoutUrl,
    resultUrl,
    b2cShortCode: mpesaConfig.b2cShortCode,
    initiatorName: mpesaConfig.initiatorName,
    securityCredential: mpesaConfig.securityCredential,
    consumerKey: mpesaConfig.consumerKey,
    consumerSecret: mpesaConfig.consumerSecret,
    remarks: `Loan ${loanId} disbursement`,
  });
  console.timeEnd('mpesaPayment');

  console.log('M-Pesa B2C response:', JSON.stringify(mpesaResponse, null, 2));

  const transactionId = mpesaResponse.TransactionID || mpesaResponse.ConversationID || mpesaResponse.OriginatorConversationID;
  const isSuccess = mpesaResponse.ResponseCode === '0';

  try {
    // Update loan immediately
    console.time('loanDisburseUpdateQuery');
    const updatedLoan = await prisma.loan.update({
      where: { id: parseInt(loanId) },
      data: {
        disbursedAt: new Date(),
        mpesaTransactionId: transactionId,
        mpesaStatus: isSuccess ? 'SUCCESS' : 'FAILED',
        status: isSuccess ? 'DISBURSED' : 'APPROVED',
      },
    });
    console.timeEnd('loanDisburseUpdateQuery');

    // Log the disbursement
    console.time('auditLogDisburseQuery');
    await prisma.auditLog.create({
      data: {
        tenant: { connect: { id: tenantId } },
        user: { connect: { id: userId } },
        action: isSuccess ? 'DISBURSE' : 'DISBURSE_ERROR',
        resource: 'LOAN',
        details: {
          loanId,
          amount,
          phoneNumber,
          mpesaTransactionId: transactionId,
          mpesaResponse,
          message: isSuccess
            ? `Loan ${loanId} disbursed to ${phoneNumber}`
            : `Failed to disburse loan ${loanId}: ${mpesaResponse.ResponseDescription || 'Unknown error'}`,
        },
      },
    });
    console.timeEnd('auditLogDisburseQuery');

    return { loan: updatedLoan, mpesaResponse };
  } catch (error) {
    console.error('Error updating loan after disbursement:', error);
    throw new Error('Failed to update loan after disbursement');
  } finally {
    await prisma.$disconnect();
  }
};





module.exports = { initiateB2CPayment, disburseB2CPayment };