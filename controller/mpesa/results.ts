// src/controllers/mpesaController.ts
import { LoanStatus, PrismaClient } from '@prisma/client';

import 'dotenv/config';
import { fetchLatestBalance} from './mpesaConfig';
import { getMpesaAccessToken } from './token';
import { Request, response, Response } from 'express';



import {
 
  MpesaTimeout,
 
 
  Loan,
  
  ResponseMpesaBalance,
  MpesaResultWrapper
 
} from '../../types/mpesa';
import { AuthenticatedRequest } from '../../middleware/verifyToken';
import { MpesaResult } from '../../types/loans/loansPayments';
import { MpesaAccBalanceResult } from '../../types/payment/b2b';


const prisma = new PrismaClient();










  const handleB2CResult = async (
    req: Request<{}, {}, MpesaResultWrapper>,
    res: Response
  ): Promise<void> => {
    if (!req.body) {
      console.error('Request body is null or undefined');
      res.status(400).json({ message: 'Invalid request body' });
      return;
    }

  const {
    ConversationID,
    OriginatorConversationID,
    ResultCode,
    ResultDesc,
    ResultType,
    ResultParameters,
    TransactionID = '', // fallback in case undefined
} = req.body.Result || {};

  if (!ConversationID || ResultCode === undefined) {
    console.error('Invalid B2C result payload:', req.body);
    res.status(400).json({ message: 'Invalid payload: Missing ConversationID or ResultCode' });
    return;
  }


    try {
      const mpesaStatus: string = ResultCode === 0 ? 'SUCCESS' : 'FAILED';
      const loanStatus: LoanStatus = ResultCode === 0 ? LoanStatus.DISBURSED : LoanStatus.APPROVED;

      const loan: Loan | null = await prisma.loan.findFirst({
        where: {
          OR: [
            { mpesaTransactionId: ConversationID },
            { originatorConversationID: OriginatorConversationID },
          ],
        },
        select: { id: true, tenantId: true, userId: true, status: true, mpesaStatus: true },
      });

      if (!loan) {
        res.status(404).json({ message: 'Loan not found for transaction' });
        return;
      }

      if (loan.mpesaStatus === 'SUCCESS' || loan.mpesaStatus === 'FAILED') {
        res.status(200).json({ message: 'Result already processed' });
        return;
      }

      // ✅ Safely extract ResultParameter fields
      const resultParamArray = ResultParameters?.ResultParameter || [];

      const transactionAmount = resultParamArray.find(p => p.Key === 'TransactionAmount')?.Value ?? null;
      const transactionReceipt = resultParamArray.find(p => p.Key === 'TransactionReceipt')?.Value ?? null;
      const receiverParty = resultParamArray.find(p => p.Key === 'ReceiverPartyPublicName')?.Value ?? null;
      const transactionDateTime = resultParamArray.find(p => p.Key === 'TransactionCompletedDateTime')?.Value ?? null;
      const utilityBalance = resultParamArray.find(p => p.Key === 'B2CUtilityAccountAvailableFunds')?.Value ?? null;
      const workingBalance = resultParamArray.find(p => p.Key === 'B2CWorkingAccountAvailableFunds')?.Value ?? null;

      // 💾 Save to DB
      await prisma.$transaction(async (tx) => {
        await tx.loan.update({
          where: { id: loan.id },
          data: {
            mpesaStatus,
            status: loanStatus,
            mpesaTransactionId: TransactionID || ConversationID,
            originatorConversationID: OriginatorConversationID,
            disbursedAt: ResultCode === 0 ? new Date() : loan.disbursedAt,
          },
        });

        await tx.mPesaBalance.upsert({
          where: { originatorConversationID: OriginatorConversationID },
          update: {
            resultType: ResultType ?? 0,
            resultCode: ResultCode,
            resultDesc: ResultDesc ?? 'No description',
            transactionID: TransactionID,
            conversationID: ConversationID,
            utilityAccountBalance: utilityBalance !== null ? parseFloat(String(utilityBalance)) : null,
            workingAccountBalance: workingBalance !== null ? parseFloat(String(workingBalance)) : null,
            updatedAt: new Date(),
          },
          create: {
            resultType: ResultType ?? 0,
            resultCode: ResultCode,
            resultDesc: ResultDesc ?? 'No description',
            originatorConversationID: OriginatorConversationID,
            conversationID: ConversationID,
            transactionID: TransactionID,
            utilityAccountBalance: utilityBalance !== null ? parseFloat(String(utilityBalance)) : null,
            workingAccountBalance: workingBalance !== null ? parseFloat(String(workingBalance)) : null,
            tenantId: loan.tenantId,
          },
        });

        await tx.auditLog.create({
          data: {
            tenantId: loan.tenantId,
            userId: loan.userId,
            action: `MPESA_B2C_RESULT_${mpesaStatus}`,
            resource: 'LOAN',
            details: {
              loanId: loan.id,
              conversationId: ConversationID,
              originatorConversationId: OriginatorConversationID,
              transactionId: TransactionID,
              transactionAmount,
              transactionReceipt,
              receiverParty,
              transactionDateTime,
              resultCode: ResultCode,
              resultDesc: ResultDesc ?? null,
              message: `B2C transaction ${ConversationID} ${mpesaStatus}`,
            },
          },
        });
      });

      // Trigger account balance check
      //setTimeout(() => invokeBalanceCheck(loan.tenantId), 1000);

      res.status(200).json({ message: 'Result processed successfully' });

    } catch (error: any) {
      console.error('Error processing B2C result:', error);
      if (!res.headersSent) {
        res.status(200).json({ message: 'Result received but processing failed', error: error.message });
      }
    }
  };




//b2b results , just print the response for now 






// Define type for Safaricom B2B callback
type MpesaB2BResult = {
  ResultType: number;
  ResultCode: number;
  ResultDesc: string;
  OriginatorConversationID: string;
  ConversationID: string;
  TransactionID?: string;
  ResultParameters?: {
    ResultParameter:
      | { Key: string; Value: string }
      | { Key: string; Value: string }[];
  };
  ReferenceData?: any;
};

type MpesaB2BCallback = {
  Result: MpesaB2BResult;
};

 const handleB2BResult = async (
  req: Request<{}, {}, MpesaB2BCallback>,
  res: Response
): Promise<void> => {
  try {
    const { Result } = req.body;

    if (!Result) {
      throw new Error("Missing Result in callback");
    }

    console.log("M-Pesa B2B Result:", JSON.stringify(Result, null, 2));

    // ✅ Determine status
    const status = Result.ResultCode === 0 ? "SUCCESS" : "FAILED";

    // ✅ Update record in DB
    const updated = await prisma.b2BTransfer.update({
      where: {
        originatorConversationID: Result.OriginatorConversationID,
      },
      data: {
        conversationID: Result.ConversationID,
        transactionID: Result.TransactionID,
        resultCode: Result.ResultCode,
        resultDesc: Result.ResultDesc,
        status,
      },
    });

    res.status(200).json({
      message: "B2B result processed",
      status,
      updated,
    });
  } catch (error: any) {
    console.error("Error handling B2B result:", error.message);
    res.status(500).json({
      message: "Failed to process B2B result",
      error: error.message,
    });
  }
};





const parseMpesaBalance = (balanceString: string) => {
  return balanceString.split("&").map(entry => {
    const [accountName, currency, available, current, reserved, uncleared] =
      entry.split("|");
    return {
      accountName: accountName.trim(),
      currency: currency.trim(),
      availableBalance: parseFloat(available),
      currentBalance: parseFloat(current),
      reservedAmount: parseFloat(reserved),
      unClearedBalance: parseFloat(uncleared),
    };
  });
};



// controllers/mpesaController.ts
 const handleAccountBalanceResultFromMpesa = async (
  req: Request<{ tenantId: string }, {}, MpesaAccBalanceResult>,
  res: Response
) => {
  const tenantId = parseInt(req.params.tenantId, 10);
  
  const { Result } = req.body;
  const mpesaStatus = Result.ResultCode === 0 ? "SUCCESS" : "FAILED";

  const balanceParam = Result.ResultParameters.ResultParameter.find(
    p => p.Key === "AccountBalance"
  );

  let mmfBalance = 0;
  let utilityBalance = 0;

  if (balanceParam) {
    const accounts = parseMpesaBalance(balanceParam.Value);
    mmfBalance = accounts.find(a => a.accountName === "Working Account")?.availableBalance ?? 0;
    utilityBalance = accounts.find(a => a.accountName === "Utility Account")?.availableBalance ?? 0;
  }

  // Save to DB tied to tenant
  await prisma.mPesaBalance.create({
    data: {
      resultType: Result.ResultType,
      resultCode: Result.ResultCode,
      resultDesc: Result.ResultDesc,
      originatorConversationID: Result.OriginatorConversationID,
      conversationID: Result.ConversationID,
      transactionID: Result.TransactionID,
      workingAccountBalance: mmfBalance,
      utilityAccountBalance: utilityBalance,
      mmfBalance,
      tenantId, // ✅ tie to tenant
    },
  });

  res.status(200).json({
    message: "Mpesa balance saved successfully",
    tenantId,
    status: mpesaStatus,
    mmfBalance,
    utilityBalance,
  });
};



const handleB2BTimeout = async (
  req: Request<{}, {}, MpesaTimeout>,
  res: Response
): Promise<void> => {
  const timeout = req.body;
  console.log('M-Pesa B2B Timeout:', JSON.stringify(timeout, null, 2));
  res.status(200).json({ message: 'B2B timeout received' });
};





const handleB2CTimeout = async (
  req: Request<{}, {}, MpesaTimeout>,
  res: Response
): Promise<void> => {
  const timeout = req.body;
  console.log('M-Pesa B2C Timeout:', JSON.stringify(timeout, null, 2));

  if (!timeout || (!timeout.ConversationID && !timeout.OriginatorConversationID)) {
    console.error('Invalid B2C timeout payload:', req.body);
    res.status(400).json({ message: 'Invalid payload' });
    return;
  }

  const transactionId = timeout.ConversationID || timeout.OriginatorConversationID;

  try {
    console.time('loanTimeoutQuery');
    const loan: Loan | null = await prisma.loan.findFirst({
      where: { mpesaTransactionId: transactionId },
      select: { id: true, tenantId: true, userId: true, status: true },
    });
    console.timeEnd('loanTimeoutQuery');

    if (!loan) {
      console.error('No loan found for transactionId:', transactionId);
      res.status(404).json({ message: 'Loan not found for transaction' });
      return;
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
        tenantId: loan.tenantId,
        userId: loan.userId,
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

    res.status(200).json({ message: 'Timeout processed' });
    return;
  } catch (error: any) {
    console.error('Error processing B2C timeout:', error);
    if (!res.headersSent) {
      res.status(200).json({ message: 'Timeout received but processing failed' });
    }
    return;
  }
};






 const handleAccountBalanceResult = async (
  req: Request,
  res: Response
): Promise<void> => {
  const result: MpesaResultWrapper['Result'] = req.body?.Result;

  if (!result) {
    console.error('Missing "Result" in request body:', req.body);
    res.status(400).json({ message: 'Invalid payload: Missing Result object' });
    return;
  }

  console.log('M-Pesa Account Balance Result:', JSON.stringify(result, null, 2));

  try {
    const params = result?.ResultParameters?.ResultParameter ?? [];

    // 🕒 Parse BOCompletedTime
    let boCompletedTimeStr = params.find((param) => param.Key === 'BOCompletedTime')?.Value ?? null;
    if (boCompletedTimeStr) boCompletedTimeStr = String(boCompletedTimeStr);

    const boCompletedTime: Date = boCompletedTimeStr
      ? new Date(
          `${boCompletedTimeStr.toString().slice(0, 4)}-${boCompletedTimeStr.toString().slice(4, 6)}-${boCompletedTimeStr.toString().slice(6, 8)}T${boCompletedTimeStr.toString().slice(8, 10)}:${boCompletedTimeStr.toString().slice(10, 12)}:${boCompletedTimeStr.toString().slice(12, 14)}`
        )
      : new Date();

    // 💰 Parse account balances
    const accountBalanceRaw = params.find((param) => param.Key === 'AccountBalance')?.Value;
    const accountBalanceStr = accountBalanceRaw ? String(accountBalanceRaw) : '';

    let workingAccountBalance: number | null = null;
    let utilityAccountBalance: number | null = null;

    if (accountBalanceStr) {
      const accounts = accountBalanceStr.split('&');
      for (const account of accounts) {
        const [accountType, , availableBalance] = account.split('|');
        if (accountType === 'Working Account') {
          workingAccountBalance = parseFloat(availableBalance);
        } else if (accountType === 'Utility Account') {
          utilityAccountBalance = parseFloat(availableBalance);
        }
      }
    }

    // 🔍 Look up tenant from existing balance
    const existingBalance = await prisma.mPesaBalance.findFirst({
      where: {
        originatorConversationID: result.OriginatorConversationID,
      },
      select: {
        tenantId: true,
      },
    });

    const tenantId = existingBalance?.tenantId ?? 0;

    // 💾 Save to DB
    await prisma.mPesaBalance.create({
      data: {
        resultType: result.ResultType ?? 0,
        resultCode: result.ResultCode,
        resultDesc: result.ResultDesc ?? '',
        originatorConversationID: result.OriginatorConversationID,
        conversationID: result.ConversationID,
        transactionID: result.TransactionID ?? '',
        workingAccountBalance,
        utilityAccountBalance,
        tenantId,
        createdAt: boCompletedTime,
        updatedAt: boCompletedTime,
      },
    });

    res.status(200).json({ message: 'Balance result processed' });
  } catch (error: any) {
    console.error('Error processing balance result:', error);
    res.status(500).json({ message: 'Error processing balance result' });
  }
};






const getLatestBalance = async (
  req: AuthenticatedRequest,
  res: Response<{ message: string; data?: ResponseMpesaBalance | null }>
): Promise<void> => {
  try {
    if (!req.user || !('tenantId' in req.user)) {
      console.log('getLatestBalance: No user or tenantId');
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const { tenantId } = req.user;
    console.log('getLatestBalance: Fetching balance for tenantId:', tenantId);

    const latest: ResponseMpesaBalance | null = await fetchLatestBalance(tenantId);

    if (!latest) {
      console.log('getLatestBalance: No balance record found');
     res.status(404).json({
        message: 'No balance record found',
        data: null,
      });
      return;
    }

    console.log('getLatestBalance: Sending success response:', latest);

    res.status(200).json({
      message: 'Success',
      data: {
        id: latest.id,
        utilityAccountBalance: latest.utilityAccountBalance ?? null,
        workingAccountBalance: latest.workingAccountBalance ?? null,
        mmfBalance: latest.mmfBalance ?? null
      },
    });
    return;

  } catch (err: any) {
    console.error('getLatestBalance: Error:', err.message || err);

    res.status(500).json({
      message: 'Error fetching balance',
      data: null,
    });
  }
};







const handleAccountBalanceTimeout = async (req: Request, res: Response): Promise<void> => {
  const timeout: MpesaTimeout = req.body;
  console.log('M-Pesa Account Balance Timeout:', JSON.stringify(timeout, null, 2));

  try {
    res.status(200).json({ message: 'Balance timeout processed' });
  } catch (err: any) {
    console.error('Error processing balance timeout:', err);
     res.status(500).json({ message: 'Error processing balance timeout' });
  } 
};

export {
  handleB2CResult,
  handleB2CTimeout,
  handleAccountBalanceResult,
  handleAccountBalanceTimeout,
  getLatestBalance,handleB2BResult,handleB2BTimeout,handleAccountBalanceResultFromMpesa
};