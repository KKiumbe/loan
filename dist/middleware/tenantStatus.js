"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const tenantStatusMiddleware = async (req, res) => {
    try {
        const tenantId = req.user?.tenantId;
        if (!tenantId) {
            res.status(401).json({ error: 'Tenant ID missing from request' });
            return;
        }
    }
    catch (error) {
        // You may want to add error handling here
    }
};
;
exports.default = tenantStatusMiddleware;
