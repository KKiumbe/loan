// src/utils/mpesaB2C.ts
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { getMpesaAccessToken } from './token';
import { getTenantSettings ,isMPESASettingsSuccess,TenantMPESASettings} from './mpesaConfig';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import { B2CPaymentPayload, DisbursePayload } from '../../types/loans/disburse';
import { getTransactionFee } from '../loan/getTrasactionFees';
import { calculateLoanInterestByLoanId } from '../loan/getInterest';
dotenv.config();

const prisma = new PrismaClient();


function sanitizePhoneNumber(phone: string): string {
  let p = phone.trim().replace(/\D/g, '');
  if (p.startsWith('0')) {
    p = '254' + p.slice(1);
  } else if (p.startsWith('7')) {
    p = '254' + p;
  } else if (!p.startsWith('254')) {
    p = '254' + p;
  } else if (p.startsWith('+')) {
    p = p.slice(1);
  }
  return p;
}

export const initiateB2CPayment = async ({
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
}: B2CPaymentPayload) => {
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
  } catch (err: any) {
    return { ...(err.response?.data || { error: err.message }), OriginatorConversationID: originatorConversationID };
  }
};

export const disburseB2CPayment = async ({ phoneNumber, amount, loanId, userId, tenantId }: DisbursePayload) => {
  const result: any = { success: false, loan: null, mpesaResponse: null, error: null };
  const originatorConversationID = uuidv4();

  try {
    if (!amount || amount <= 0) throw new Error('Invalid amount');
    if (!loanId || !userId || !tenantId) throw new Error('Missing identifiers');

    const sanitizedPhone = sanitizePhoneNumber(phoneNumber);
    if (!/^2547\d{8}$/.test(sanitizedPhone)) {
      throw new Error('Invalid phone number format after sanitization');
    }


const settings = await getTenantSettings(tenantId);

if (!isMPESASettingsSuccess(settings)) {
  throw new Error(settings.message);
}

const { mpesaConfig } = settings;




    const resultUrl = `${process.env.APP_BASE_URL}/api/b2c-result`;
    const queueTimeoutUrl = `${process.env.APP_BASE_URL}/api/b2c-timeout`;

    await prisma.loan.update({
      where: { id: loanId },
      data: { originatorConversationID },
    });

    const response = await initiateB2CPayment({
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
      originatorConversationID,
    });

    if (response.error) throw new Error(response.error);

    const mpesaResponse = response;
    result.mpesaResponse = mpesaResponse;
    console.log(`M-Pesa B2C Response: ${JSON.stringify(mpesaResponse, null, 2)}`);


    const transactionFee = await getTransactionFee(amount,tenantId);

    const interestAmount =  await calculateLoanInterestByLoanId(loanId);

    const transactionId = mpesaResponse.TransactionID || mpesaResponse.ConversationID || '';
    const isSuccess = mpesaResponse.ResponseCode === '0';

    const params = mpesaResponse.ResultParameters?.ResultParameter || [];
    const utility = params.find((p: any) => p.Key === 'B2CUtilityAccountAvailableFunds')?.Value ?? null;
    const working = params.find((p: any) => p.Key === 'B2CWorkingAccountAvailableFunds')?.Value ?? null;

    const updatedLoan = await prisma.$transaction(async (tx) => {
      const loanRecord = await tx.loan.update({
        where: { id: loanId },
        data: {
          disbursedAt: new Date(),
          mpesaTransactionId: transactionId,
          mpesaStatus: isSuccess ? 'Pending' : 'Failed',
          status: isSuccess ? 'DISBURSED' : 'APPROVED',
          originatorConversationID,
          transactionFee:transactionFee,
          interest:interestAmount
          
          
        },
      });

      await tx.mPesaBalance.create({
        data: {
          resultType: mpesaResponse.ResultType ?? 0,
          resultCode: mpesaResponse.ResultCode ?? 0,
          resultDesc: mpesaResponse.ResultDesc ?? 'No description provided',
          originatorConversationID,
          conversationID: mpesaResponse.ConversationID ?? '',
          transactionID: transactionId,
          utilityAccountBalance: utility !== null ? parseFloat(utility) : null,
          workingAccountBalance: working !== null ? parseFloat(working) : null,
          tenantId,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          action: isSuccess ? 'DISBURSE' : 'DISBURSE_ERROR',
          resource: 'LOAN',
          details: JSON.stringify({ loanId, phoneNumber: sanitizedPhone, transactionId, originatorConversationID, mpesaResponse }),
        },
      });

      return loanRecord;
    });

    result.loan = updatedLoan;
    result.success = isSuccess;
  } catch (err: any) {
    result.error = err.message;

    if (!result.mpesaResponse) {
      await prisma.$transaction(async (tx) => {
        await tx.mPesaBalance.create({
          data: {
            resultType: 0,
            resultCode: -1,
            resultDesc: `Failed to initiate disbursement: ${err.message}`,
            originatorConversationID,
            conversationID: '',
            transactionID: '',
            utilityAccountBalance: null,
            workingAccountBalance: null,
            tenantId:tenantId!,

           
          },
        });

        await tx.auditLog.create({
          data: {
            tenantId:tenantId!,
            userId:userId!,
            action: 'DISBURSE_ERROR',
            resource: 'LOAN',
            details: JSON.stringify({ loanId, phoneNumber, error: err.message, originatorConversationID }),
          },
        });
      });
    }
  } 
  return result;
};
