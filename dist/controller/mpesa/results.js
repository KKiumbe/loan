"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLatestBalance = exports.handleAccountBalanceTimeout = exports.handleAccountBalanceResult = exports.handleB2CTimeout = exports.handleB2CResult = void 0;
// src/controllers/mpesaController.ts
const client_1 = require("@prisma/client");
require("dotenv/config");
const mpesaConfig_1 = require("./mpesaConfig");
const prisma = new client_1.PrismaClient();
const handleB2CResult = async (req, res) => {
    if (!req.body) {
        console.error('Request body is null or undefined');
        res.status(400).json({ message: 'Invalid request body' });
        return;
    }
    const { ConversationID, OriginatorConversationID, ResultCode, ResultDesc, ResultType, ResultParameters, TransactionID = '', // fallback in case undefined
     } = req.body.Result || {};
    if (!ConversationID || ResultCode === undefined) {
        console.error('Invalid B2C result payload:', req.body);
        res.status(400).json({ message: 'Invalid payload: Missing ConversationID or ResultCode' });
        return;
    }
    try {
        const mpesaStatus = ResultCode === 0 ? 'SUCCESS' : 'FAILED';
        const loanStatus = ResultCode === 0 ? client_1.LoanStatus.DISBURSED : client_1.LoanStatus.APPROVED;
        const loan = await prisma.loan.findFirst({
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
    }
    catch (error) {
        console.error('Error processing B2C result:', error);
        if (!res.headersSent) {
            res.status(200).json({ message: 'Result received but processing failed', error: error.message });
        }
    }
};
exports.handleB2CResult = handleB2CResult;
const handleB2CTimeout = async (req, res) => {
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
        const loan = await prisma.loan.findFirst({
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
    }
    catch (error) {
        console.error('Error processing B2C timeout:', error);
        if (!res.headersSent) {
            res.status(200).json({ message: 'Timeout received but processing failed' });
        }
        return;
    }
};
exports.handleB2CTimeout = handleB2CTimeout;
const handleAccountBalanceResult = async (req, res) => {
    const result = req.body?.Result;
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
        if (boCompletedTimeStr)
            boCompletedTimeStr = String(boCompletedTimeStr);
        const boCompletedTime = boCompletedTimeStr
            ? new Date(`${boCompletedTimeStr.toString().slice(0, 4)}-${boCompletedTimeStr.toString().slice(4, 6)}-${boCompletedTimeStr.toString().slice(6, 8)}T${boCompletedTimeStr.toString().slice(8, 10)}:${boCompletedTimeStr.toString().slice(10, 12)}:${boCompletedTimeStr.toString().slice(12, 14)}`)
            : new Date();
        // 💰 Parse account balances
        const accountBalanceRaw = params.find((param) => param.Key === 'AccountBalance')?.Value;
        const accountBalanceStr = accountBalanceRaw ? String(accountBalanceRaw) : '';
        let workingAccountBalance = null;
        let utilityAccountBalance = null;
        if (accountBalanceStr) {
            const accounts = accountBalanceStr.split('&');
            for (const account of accounts) {
                const [accountType, , availableBalance] = account.split('|');
                if (accountType === 'Working Account') {
                    workingAccountBalance = parseFloat(availableBalance);
                }
                else if (accountType === 'Utility Account') {
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
    }
    catch (error) {
        console.error('Error processing balance result:', error);
        res.status(500).json({ message: 'Error processing balance result' });
    }
};
exports.handleAccountBalanceResult = handleAccountBalanceResult;
const getLatestBalance = async (req, res) => {
    try {
        if (!req.user || !('tenantId' in req.user)) {
            console.log('getLatestBalance: No user or tenantId');
            res.status(401).json({ message: 'Authentication required' });
            return;
        }
        const { tenantId } = req.user;
        console.log('getLatestBalance: Fetching balance for tenantId:', tenantId);
        const latest = await (0, mpesaConfig_1.fetchLatestBalance)(tenantId);
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
            },
        });
        return;
    }
    catch (err) {
        console.error('getLatestBalance: Error:', err.message || err);
        res.status(500).json({
            message: 'Error fetching balance',
            data: null,
        });
    }
};
exports.getLatestBalance = getLatestBalance;
const handleAccountBalanceTimeout = async (req, res) => {
    const timeout = req.body;
    console.log('M-Pesa Account Balance Timeout:', JSON.stringify(timeout, null, 2));
    try {
        res.status(200).json({ message: 'Balance timeout processed' });
    }
    catch (err) {
        console.error('Error processing balance timeout:', err);
        res.status(500).json({ message: 'Error processing balance timeout' });
    }
};
exports.handleAccountBalanceTimeout = handleAccountBalanceTimeout;
