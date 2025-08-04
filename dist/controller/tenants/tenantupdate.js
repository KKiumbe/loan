"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.upload = exports.fetchTenantDetails = exports.fetchTenant = exports.uploadLogo = exports.getTenantDetails = exports.updateTenantDetails = void 0;
const client_1 = require("@prisma/client");
const multer_1 = __importDefault(require("multer"));
// Initialize Prisma client
const prisma = new client_1.PrismaClient();
// Set up storage engine for multer to save the uploaded file
const storage = multer_1.default.diskStorage({
    destination: './uploads/',
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    },
});
const upload = (0, multer_1.default)({ storage });
exports.upload = upload;
// Controller function to handle logo upload
const uploadLogo = async (req, res) => {
    const { tenantId } = req.params;
    // Check if a file was uploaded
    if (!req.file) {
        res.status(400).json({ error: 'No file uploaded.' });
        return;
    }
    try {
        // Construct the logo URL
        const logoUrl = `/uploads/${req.file.filename}`;
        // Update the tenant's logo URL in the database
        const updatedTenant = await prisma.tenant.update({
            where: { id: parseInt(tenantId, 10) },
            data: { logoUrl },
        });
        res.status(200).json({
            message: 'Logo uploaded and tenant updated successfully.',
            tenant: updatedTenant,
        });
    }
    catch (error) {
        console.error('Error uploading logo:', error);
        res.status(500).json({ error: 'Failed to upload logo.', details: error.message });
    }
};
exports.uploadLogo = uploadLogo;
// Update Tenant Details (Supports Partial Updates)
const updateTenantDetails = async (req, res) => {
    const { tenantId } = req.params;
    const updateData = req.body;
    const { role, tenantId: userTenantId, user: userId } = req.user;
    const tenantIdInt = parseInt(tenantId, 10);
    try {
        // Fetch the tenant to ensure it exists
        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantIdInt },
        });
        if (!tenant) {
            res.status(404).json({ error: 'Tenant not found.' });
            return;
        }
        // Ensure the user belongs to the same tenant or has appropriate privileges
        if (userTenantId !== tenantIdInt && !role.includes('SUPER_ADMIN')) {
            res.status(403).json({ error: 'Access denied. You do not have permission to update this tenant.' });
            return;
        }
        // Ensure proper data types for numeric and enum values
        if (updateData.monthlyCharge !== undefined) {
            updateData.monthlyCharge = parseFloat(updateData.monthlyCharge);
        }
        if (updateData.allowedUsers !== undefined) {
            updateData.allowedUsers = parseInt(updateData.allowedUsers, 10);
        }
        if (updateData.status !== undefined) {
            if (!Object.values(client_1.TenantStatus).includes(updateData.status)) {
                res.status(400).json({ error: 'Invalid tenant status.' });
                return;
            }
        }
        // Update the tenant details
        const updatedTenant = await prisma.tenant.update({
            where: { id: tenantIdInt },
            data: updateData,
        });
        // Log the changes in the audit log
        await prisma.auditLog.create({
            data: {
                action: 'UPDATE_TENANT',
                resource: 'TENANT',
                tenant: {
                    connect: { id: tenantIdInt },
                },
                user: {
                    connect: { id: userId },
                },
                details: {
                    updatedFields: Object.keys(updateData),
                },
            },
        });
        res.status(200).json({
            message: 'Tenant details updated successfully.',
            updatedTenant,
        });
    }
    catch (error) {
        console.error('Error updating tenant details:', error);
        res.status(500).json({ error: 'Failed to update tenant details.', details: error.message });
    }
};
exports.updateTenantDetails = updateTenantDetails;
// Fetch Tenant Details
const fetchTenantDetails = async (tenantID, res) => {
    try {
        // Fetch the tenant with relationships
        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantID },
            select: {
                name: true,
                status: true,
                subscriptionPlan: true,
                monthlyCharge: true,
                allowedUsers: true,
                createdAt: true,
                updatedAt: true,
                email: true,
                phoneNumber: true,
                alternativePhoneNumber: true,
                county: true,
                town: true,
                address: true,
                building: true,
                street: true,
                website: true,
                logoUrl: true,
            },
        });
        if (!tenant) {
            if (res) {
                res.status(404).json({ error: 'Tenant not found.' });
            }
            return;
        }
        return tenant;
    }
    catch (error) {
        console.error('Error fetching tenant details:', error);
        if (res) {
            res.status(500).json({ error: 'Failed to retrieve tenant details.', details: error.message });
        }
    }
};
exports.fetchTenantDetails = fetchTenantDetails;
// Get Tenant Details
const getTenantDetails = async (req, res) => {
    const { tenantId } = req.user;
    if (!tenantId) {
        res.status(400).json({ message: 'No tenantId found in token' });
        return;
    }
    try {
        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            select: {
                id: true,
                name: true,
                status: true,
                subscriptionPlan: true,
                monthlyCharge: true,
                email: true,
                phoneNumber: true,
                alternativePhoneNumber: true,
                county: true,
                town: true,
                address: true,
                building: true,
                street: true,
                website: true,
                logoUrl: true,
                allowedUsers: true,
                createdAt: true,
                updatedAt: true,
                _count: {
                    select: {
                        organizations: true,
                    },
                },
                mpesaConfig: true,
                smsConfig: true,
            },
        });
        if (!tenant) {
            res.status(404).json({ message: 'Tenant not found' });
            return;
        }
        // Rename the count field for clarity
        const { _count, ...rest } = tenant;
        res.json({
            tenant: {
                ...rest,
                organizationCount: _count.organizations,
            },
        });
    }
    catch (err) {
        console.error('getTenant error', err);
        res.status(500).json({ message: 'Failed to fetch tenant' });
    }
};
exports.getTenantDetails = getTenantDetails;
// Fetch Tenant
const fetchTenant = async (tenantId) => {
    try {
        if (!tenantId)
            throw new Error('Tenant ID is required');
        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            select: {
                id: true,
                name: true,
                status: true,
                subscriptionPlan: true,
                monthlyCharge: true,
                email: true,
                phoneNumber: true,
                alternativePhoneNumber: true,
                allowedUsers: true,
            },
        });
        if (!tenant)
            throw new Error('Tenant not found');
        return tenant;
    }
    catch (error) {
        console.error('Error fetching tenant details:', error.message);
        throw error;
    }
};
exports.fetchTenant = fetchTenant;
