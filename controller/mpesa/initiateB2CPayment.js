// src/utils/mpesaB2C.js
//prismaClient.js

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const axios = require('axios');
const { getMpesaAccessToken } = require('./token');
const { getTenantSettings } = require('./mpesaConfig');

require('dotenv').config();







// const getMpesaAccessToken = async (consumerKey, consumerSecret) => {
//   const oauthUrl = process.env.MPESA_OAUTH_URL || 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';

//   if (!consumerKey || !consumerSecret || !oauthUrl) {
//     throw new Error('Missing M-Pesa OAuth configuration');
//   }

//   const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

//   try {
//     console.time('mpesaOAuthQuery');
//     const response = await axios.get(oauthUrl, {
//       headers: {
//         Authorization: `Basic ${auth}`,
//       },
//       timeout: 10000,
//     });
//     console.timeEnd('mpesaOAuthQuery');
//     return response.data.access_token;
//   } catch (error) {
//     console.error('Error fetching M-Pesa access token:', error.response?.data || error.message);
//     throw new Error('Failed to fetch M-Pesa access token');
//   }
// };

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
  const b2cUrl = process.env.MPESA_B2C_URL || 'https://sandbox.safaricom.co.ke/mpesa/b2c/v1/paymentrequest';

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

  const accessToken = await getMpesaAccessToken(consumerKey, consumerSecret);

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

  try {
    console.time('mpesaB2CQuery');
    const response = await axios.post(b2cUrl, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
    console.timeEnd('mpesaB2CQuery');
    return response.data;
  } catch (error) {
    console.error('Error initiating B2C payment:', error.response?.data || error.message);
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

  // Fetch tenant-specific M-Pesa configuration
  console.time('getTenantSettingsQuery');
  const settingsResponse = await getTenantSettings(tenantId);
  console.timeEnd('getTenantSettingsQuery');

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