"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const getUserOrganizationIdById = async (req, res) => {
    try {
        const { id: userId } = req.user;
        // Validate input
        if (!userId || typeof userId !== 'number') {
            console.error(`Invalid userId: ${userId}`);
            throw new Error('Valid userId is required');
        }
        // Query the user to get organizationId
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { organizationId: true },
        });
        console.log(`this is the user ${JSON.stringify(user)}`);
        if (!user) {
            console.error(`User not found: userId ${userId}`);
            return null;
        }
        return user.organizationId || null;
    }
    catch (error) {
        console.error(`Error retrieving organizationId for userId`);
        throw error;
    }
};
exports.default = getUserOrganizationIdById;
