"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTransactionFee = void 0;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const getTransactionFee = async (amount, tenantId) => {
    const band = await prisma.transactionCostBand.findFirst({
        where: {
            tenantId,
            minAmount: { lte: amount },
            maxAmount: { gte: amount },
        },
    });
    return band?.cost ?? 0;
};
exports.getTransactionFee = getTransactionFee;
