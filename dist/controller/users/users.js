"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUsers = exports.createOrgAdmin = exports.registerUser = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const client_1 = require("@prisma/client");
const sms_1 = require("../sms/sms"); // Adjust path
const role_1 = __importDefault(require("../../DatabaseConfig/role")); // Adjust path
const prisma = new client_1.PrismaClient();
const registerUser = async (req, res, next) => {
    const { employeeId, phoneNumber, idNumber, password } = req.body;
    const { tenantId } = req.user;
    if (!req.user.role.includes('ORG_ADMIN') && !req.user.role.includes('ADMIN')) {
        res.status(403).json({ message: 'Access denied. Only admins can create users.' });
        return;
    }
    if (!password || !tenantId) {
        res.status(400).json({ message: 'Password and tenantId are required' });
        return;
    }
    try {
        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { id: true, name: true },
        });
        if (!tenant) {
            res.status(404).json({ message: 'Tenant not found' });
            return;
        }
        // Look up the employee
        let employee;
        if (employeeId) {
            employee = await prisma.employee.findFirst({
                where: { id: employeeId, tenantId },
            });
        }
        else {
            employee = await prisma.employee.findFirst({
                where: {
                    OR: [
                        phoneNumber ? { phoneNumber } : {},
                        idNumber ? { idNumber } : {},
                    ].filter(Boolean),
                    tenantId,
                },
            });
        }
        if (!employee) {
            res.status(404).json({ message: 'Employee not found' });
            return;
        }
        // Check if a user already exists for this employee
        const existingUser = await prisma.user.findFirst({
            where: { employeeId: employee.id },
        });
        if (existingUser) {
            res.status(400).json({ message: 'User already exists for this employee' });
            return;
        }
        // Check if the phone number is already used by another user
        const userByPhone = await prisma.user.findFirst({
            where: { phoneNumber: employee.phoneNumber },
        });
        if (userByPhone) {
            res.status(400).json({ message: 'Phone number is already registered' });
            return;
        }
        const defaultRole = 'EMPLOYEE';
        if (!role_1.default[defaultRole]) {
            res.status(500).json({ message: 'Default role is not defined in ROLE_PERMISSIONS' });
            return;
        }
        const hashedPassword = await bcrypt_1.default.hash(password, 10);
        console.log("Creating user for employee:", {
            id: employee.id,
            phoneNumber: employee.phoneNumber,
            firstName: employee.firstName,
            lastName: employee.lastName,
        });
        const newUser = await prisma.user.create({
            data: {
                firstName: employee.firstName,
                lastName: employee.lastName,
                email: null,
                phoneNumber: employee.phoneNumber,
                password: hashedPassword,
                employee: { connect: { id: employee.id } },
                role: { set: [defaultRole] },
                createdBy: req.user.id || null,
                lastLogin: new Date(),
                status: 'ACTIVE',
                tenantName: tenant.name || null,
                tenant: {
                    connect: { id: tenantId },
                },
            },
        });
        const welcomeMessage = `Welcome to ${tenant.name}! Your account has been created. Your password is: ${password}`;
        await (0, sms_1.sendSMS)(tenantId, employee.phoneNumber, welcomeMessage);
        res.status(201).json({ message: 'User created successfully', user: newUser });
    }
    catch (error) {
        console.error('Error creating user:', error);
        next(error);
    }
};
exports.registerUser = registerUser;
const createOrgAdmin = async (req, res, next) => {
    const { firstName, lastName, phoneNumber, email, password, organizationId } = req.body;
    const { tenantId } = req.user;
    try {
        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
        if (!tenant) {
            console.error(`Tenant not found: tenantId ${tenantId}`);
            res.status(404).json({ error: 'Tenant (Lender Organization) not found' });
            return;
        }
        const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
        if (!organization) {
            console.error(`Borrower Organization not found: organizationId ${organizationId}`);
            res.status(404).json({ error: 'Borrower Organization not found' });
            return;
        }
        // Verify organization belongs to tenant
        if (organization.tenantId !== tenantId) {
            console.error(`Access denied: Organization tenantId ${organization.tenantId} does not match requested tenantId ${tenantId}`);
            res.status(403).json({ error: 'Organization does not belong to this tenant' });
            return;
        }
        const existingUser = await prisma.user.findFirst({
            where: { OR: [{ email }, { phoneNumber }] },
        });
        if (existingUser) {
            console.error(`User already exists: email ${email} or phoneNumber ${phoneNumber}`);
            res.status(400).json({ error: 'Email or phone number already in use' });
            return;
        }
        const hashedPassword = await bcrypt_1.default.hash(password, 10);
        const user = await prisma.user.create({
            data: {
                firstName,
                lastName,
                phoneNumber,
                email,
                password: hashedPassword,
                tenantId,
                organizationId,
                tenantName: tenant.name,
                role: ['ORG_ADMIN'],
                status: 'ACTIVE',
            },
        });
        console.log(`Org Admin created: userId ${user.id}`);
        res.status(201).json({ message: 'Org Admin created successfully', user });
    }
    catch (error) {
        console.error('Failed to create Org Admin:', error);
        next(error);
    }
};
exports.createOrgAdmin = createOrgAdmin;
// Other controllers (getUsers, getUserProfile, updateUser, updateOwnProfile, deleteUser)
// Follow similar pattern: add types, include next parameter, return Promise<void>, use next(error) for errors
const getUsers = async (req, res, next) => {
    const { tenantId, organizationId, role } = req.query;
    try {
        if (tenantId && parseInt(tenantId) !== req.user.tenantId) {
            console.error(`Access denied: User tenantId ${req.user.tenantId} does not match requested tenantId ${tenantId}`);
            res.status(403).json({ error: 'You can only view users in your tenant' });
            return;
        }
        let users;
        if (req.user.role.includes('ORG_ADMIN') && organizationId) {
            if (parseInt(organizationId) !== req.user.organizationId) {
                console.error(`Access denied: User organizationId ${req.user.organizationId} does not match requested organizationId ${organizationId}`);
                res.status(403).json({ error: 'You can only view users in your borrower organization' });
                return;
            }
            users = await prisma.user.findMany({
                where: {
                    tenantId: parseInt(tenantId),
                    organizationId: parseInt(organizationId),
                    role: { has: role || 'EMPLOYEE' },
                },
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    phoneNumber: true,
                    role: true,
                    status: true,
                    createdAt: true,
                    updatedAt: true,
                },
            });
        }
        else {
            users = await prisma.user.findMany({
                where: {
                    tenantId: parseInt(tenantId),
                    role: role ? { has: role } : undefined,
                },
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    phoneNumber: true,
                    role: true,
                    status: true,
                    createdAt: true,
                    updatedAt: true,
                },
            });
        }
        console.log(`Fetched ${users.length} users for tenantId ${tenantId}`);
        res.status(200).json({ users });
    }
    catch (error) {
        console.error('Failed to fetch users:', error);
        next(error);
    }
};
exports.getUsers = getUsers;
// Add similar TypeScript conversions for getUserProfile, updateUser, updateOwnProfile, deleteUser
// (Omitted for brevity, but follow the same pattern: use AuthenticatedRequest, return Promise<void>, pass errors to next)
exports.default = {
    registerUser: exports.registerUser,
    createOrgAdmin: exports.createOrgAdmin,
    getUsers: exports.getUsers,
    // getUserProfile,
    // updateUser,
    // updateOwnProfile,
    // deleteUser,
};
