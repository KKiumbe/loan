"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserOrganizationIdById = exports.bulkUploadFromCSV = void 0;
const client_1 = require("@prisma/client");
const csv_parser_1 = __importDefault(require("csv-parser"));
const streamifier_1 = __importDefault(require("streamifier"));
// Mock implementation (replace with actual import)
const getUserOrganizationIdById = async (userId) => {
    throw new Error('getUserOrganizationIdById not implemented');
};
exports.getUserOrganizationIdById = getUserOrganizationIdById;
const prisma = new client_1.PrismaClient();
// Bulk Upload from CSV
const bulkUploadFromCSV = async (req, res) => {
    const { tenantId, organizationId } = req.body;
    if (!tenantId || !organizationId) {
        res.status(400).json({ error: 'tenantId and organizationId are required in the body' });
        return;
    }
    if (!req.file) {
        res.status(400).json({ error: 'CSV file is required' });
        return;
    }
    // Authorization check
    const user = req.user;
    if (!user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
    }
    const { tenantId: userTenantId, role } = user;
    if (parseInt(tenantId) !== userTenantId) {
        res.status(403).json({ error: 'Access denied. You can only upload for your own tenant.' });
        return;
    }
    if (role.includes('ORG_ADMIN')) {
        const userOrgId = await getUserOrganizationIdById(user.id);
        if (userOrgId !== parseInt(organizationId)) {
            res.status(403).json({ error: 'Access denied. You can only upload for your own organization.' });
            return;
        }
    }
    const buffer = req.file.buffer;
    const results = [];
    const failed = [];
    const stream = streamifier_1.default.createReadStream(buffer).pipe((0, csv_parser_1.default)());
    stream.on('data', (row) => {
        results.push(row);
    });
    stream.on('end', async () => {
        const created = [];
        for (const emp of results) {
            try {
                const { phoneNumber, idNumber, firstName, lastName, grossSalary, jobId, secondaryPhoneNumber, } = emp;
                if (!phoneNumber || !idNumber || !firstName || !lastName || !grossSalary) {
                    failed.push({ ...emp, reason: 'Missing required fields' });
                    continue;
                }
                const parsedGrossSalary = parseFloat(grossSalary);
                if (isNaN(parsedGrossSalary) || parsedGrossSalary <= 0) {
                    failed.push({ ...emp, reason: 'Invalid gross salary' });
                    continue;
                }
                const exists = await prisma.employee.findFirst({
                    where: { phoneNumber, tenantId: parseInt(tenantId) },
                });
                if (exists) {
                    failed.push({ ...emp, reason: 'Duplicate phone number' });
                    continue;
                }
                const createdEmp = await prisma.employee.create({
                    data: {
                        phoneNumber,
                        idNumber,
                        firstName,
                        lastName,
                        grossSalary: parsedGrossSalary,
                        jobId,
                        secondaryPhoneNumber,
                        tenantId: parseInt(tenantId),
                        organizationId: parseInt(organizationId),
                    },
                });
                created.push(createdEmp);
            }
            catch (err) {
                failed.push({ ...emp, reason: 'Error creating record' });
            }
        }
        res.json({
            success: true,
            created: created.length,
            failed: failed.length,
            failedRecords: failed,
        });
    });
    stream.on('error', (err) => {
        console.error('Error parsing CSV:', err);
        res.status(500).json({ error: 'Failed to parse CSV file' });
    });
};
exports.bulkUploadFromCSV = bulkUploadFromCSV;
