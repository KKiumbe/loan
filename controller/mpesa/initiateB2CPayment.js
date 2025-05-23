// src/utils/mpesaB2C.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const axios = require('axios');
const { getMpesaAccessToken } = require('./token');
const { getTenantSettings } = require('./mpesaConfig');

const { v4: uuidv4 } = require('uuid');
require('dotenv').config();




/**
 * Normalize Kenyan phone numbers to E.164 without '+'
 * Ensures format: 2547XXXXXXXX
 */
function sanitizePhoneNumber(phone) {
  let p = phone.trim().replace(/\D/g, '');
  if (p.startsWith('0')) {
    p = '254' + p.slice(1);
  } else if (p.startsWith('7')) {
    p = '254' + p;
  } else if (!p.startsWith('254')) {
    p = '254' + p;
  }
  else if (p.startsWith('+')) {
    p = p.slice(1);
  }
  return p;
}

/**
 * Initiates a B2C payment, returning the raw M-Pesa response object.
 * Requires OriginatorConversationID to correlate callbacks.
 */
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
  originatorConversationID = uuidv4(),
}) => {
  const b2cUrl = process.env.MPESA_B2C_URL;
  if (!b2cUrl || !b2cShortCode || !initiatorName || !securityCredential) {
    return { error: 'Missing M-Pesa B2C configuration' };
  }
  if (!amount || amount <= 0) {
    return { error: 'Invalid amount' };
  }
  if (!queueTimeoutUrl || !resultUrl) {
    return { error: 'Missing webhook URLs' };
  }

  const accessToken = await getMpesaAccessToken(consumerKey, consumerSecret);
  if (!accessToken) {
    return { error: 'Failed to fetch M-Pesa access token' };
  }

  const payload = {
    OriginatorConversationID: originatorConversationID,
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

  console.log(`Initiating B2C call. OriginatorConversationID: ${originatorConversationID}`);
  try {
    console.time('mpesaB2CQuery');
    const { data } = await axios.post(b2cUrl, payload, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 30000,
    });
    console.timeEnd('mpesaB2CQuery');
    return { ...data, OriginatorConversationID: originatorConversationID };
  } catch (err) {
    return { ...(err.response?.data || { error: err.message }), OriginatorConversationID: originatorConversationID };
  }
};

/**
 * Disburses a loan via B2C payment, updates loan record, and returns a unified result object.
 * Sanitizes phone numbers to ensure correct format.
 */
const disburseB2CPayment = async ({ phoneNumber, amount, loanId, userId, tenantId }) => {
  const result = { success: false, loan: null, mpesaResponse: null, error: null };
  try {
    if (!amount || amount <= 0) throw new Error('Invalid amount');
    if (!loanId || !userId || !tenantId) throw new Error('Missing identifiers');

    // Sanitize phone
    const sanitizedPhone = sanitizePhoneNumber(phoneNumber);
    if (!/^2547\d{8}$/.test(sanitizedPhone)) {
      throw new Error('Invalid phone number format after sanitization');
    }

    const settings = await getTenantSettings(tenantId);
    if (!settings.success) throw new Error(settings.message || 'Failed to fetch M-Pesa config');

    const { mpesaConfig } = settings;
    const resultUrl = `${process.env.APP_BASE_URL}/api/b2c-result`;
    const queueTimeoutUrl = `${process.env.APP_BASE_URL}/api/b2c-timeout`;

    const mpesaResponse = await initiateB2CPayment({
      amount,
      phoneNumber: sanitizedPhone,
      queueTimeoutUrl,
      resultUrl,
      b2cShortCode: mpesaConfig.b2cShortCode,
      initiatorName: mpesaConfig.initiatorName,
      securityCredential: mpesaConfig.securityCredential,
      consumerKey: mpesaConfig.consumerKey,
      consumerSecret: mpesaConfig.consumerSecret,
      remarks: `Loan ${loanId} disbursement`,
    });
    result.mpesaResponse = mpesaResponse;

    const transactionId = mpesaResponse.TransactionID || mpesaResponse.ConversationID || '';
    const isSuccess = mpesaResponse.ResponseCode === '0';

    const updatedLoan = await prisma.loan.update({
      where: { id: parseInt(loanId, 10) },
      data: {
        disbursedAt: new Date(),
        mpesaTransactionId: transactionId,
        mpesaStatus: isSuccess ? 'SUCCESS' : 'FAILED',
        status: isSuccess ? 'DISBURSED' : 'APPROVED',
      },
    });
    result.loan = updatedLoan;
    result.success = isSuccess;

    await prisma.auditLog.create({
      data: {
        tenant: { connect: { id: tenantId } },
        user: { connect: { id: userId } },
        action: isSuccess ? 'DISBURSE' : 'DISBURSE_ERROR',
        resource: 'LOAN',
        details: { loanId, phoneNumber: sanitizedPhone, transactionId, mpesaResponse },
      },
    });
  } catch (err) {
    result.error = err.message;
  } finally {
    await prisma.$disconnect();
  }
  return result;
};

module.exports = { initiateB2CPayment, disburseB2CPayment };
