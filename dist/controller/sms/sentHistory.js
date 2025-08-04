"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSentSmsHistory = void 0;
const client_1 = require("@prisma/client");
const role_1 = __importDefault(require("../../DatabaseConfig/role"));
const prisma = new client_1.PrismaClient();
// Get sent SMS history for a tenant
const getSentSmsHistory = async (req, res, next) => {
    try {
        const tenantId = req.user?.tenantId;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        // Check if user is authenticated
        if (!tenantId) {
            res.status(401).json({ message: 'Unauthorized: Tenant ID is required' });
            return;
        }
        // Check permissions
        if (!req.user?.role.some((role) => role_1.default[role]?.sms_history &&
            Array.isArray(role_1.default[role]?.sms_history) &&
            role_1.default[role]?.sms_history.every((item) => typeof item === 'string') &&
            (role_1.default[role]?.sms_history).includes('read'))) {
            res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
            return;
        }
        // Fetch SMS history and total count concurrently
        const [data, totalRecords] = await Promise.all([
            prisma.sMS.findMany({
                where: { tenantId },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
                select: {
                    id: true,
                    mobile: true,
                    message: true,
                    status: true,
                    createdAt: true,
                },
            }),
            prisma.sMS.count({
                where: { tenantId },
            }),
        ]);
        // Type the response
        const response = { data, totalRecords };
        res.status(200).json(response);
    }
    catch (error) {
        console.error('Error fetching SMS history:', error);
        next(new Error('Failed to fetch SMS history'));
    }
    finally {
        await prisma.$disconnect();
    }
};
exports.getSentSmsHistory = getSentSmsHistory;
exports.default = { getSentSmsHistory: exports.getSentSmsHistory };
