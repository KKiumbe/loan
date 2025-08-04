"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserOrganizationIdById = exports.getCurrentUser = exports.removeRoles = exports.fetchUser = exports.updateUserDetails = exports.stripRoles = exports.deleteUser = exports.assignRole = exports.getAllUsers = void 0;
const client_1 = require("@prisma/client");
const bcrypt_1 = __importDefault(require("bcrypt"));
const role_1 = __importDefault(require("../../DatabaseConfig/role"));
// Mock implementation (replace with actual import)
const getUserOrganizationIdById = async (userId) => {
    // Replace with actual implementation or import
    throw new Error('getUserOrganizationIdById not implemented');
};
exports.getUserOrganizationIdById = getUserOrganizationIdById;
const prisma = new client_1.PrismaClient();
// Get Current User
const getCurrentUser = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }
        const { id } = user;
        const loggedUser = await prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phoneNumber: true,
                gender: true,
                county: true,
                town: true,
                role: true,
                status: true,
                createdAt: true,
                updatedAt: true,
                lastLogin: true,
                loginCount: true,
            },
        });
        if (!loggedUser) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        res.json({ user: loggedUser });
    }
    catch (error) {
        console.error('Error fetching current user:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getCurrentUser = getCurrentUser;
// Get All Users
const getAllUsers = async (req, res) => {
    const { tenantId } = req.user;
    console.log(`this is the tenant id ${tenantId}`);
    if (!tenantId) {
        res.status(400).json({ error: 'Tenant ID is required' });
        return;
    }
    try {
        const users = await prisma.user.findMany({
            where: { tenantId },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
                createdBy: true,
                status: true,
                createdAt: true,
                lastLogin: true,
                loginCount: true,
            },
        });
        if (!users.length) {
            res.status(403).json({ message: 'You can only perform actions within your own tenant.' });
            return;
        }
        res.status(200).json({ users });
    }
    catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Failed to fetch users', details: error.message });
    }
};
exports.getAllUsers = getAllUsers;
// Assign Role
const assignRole = async (req, res) => {
    const { userId, role } = req.body;
    const { role: requesterRole, tenantId: requesterTenantId } = req.user;
    if (!userId) {
        res.status(400).json({ error: 'User ID is required' });
        return;
    }
    if (!Array.isArray(requesterRole)) {
        res.status(400).json({ error: 'Roles must be an array' });
        return;
    }
    const validRoles = Object.keys(role_1.default);
    const invalidRoles = role.filter(r => !validRoles.includes(r));
    if (invalidRoles.length > 0) {
        res.status(400).json({ error: 'Invalid roles' });
        return;
    }
    try {
        const userToUpdate = await prisma.user.findUnique({
            where: { id: userId },
            select: { tenantId: true },
        });
        if (!userToUpdate) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        if (userToUpdate.tenantId !== requesterTenantId) {
            res.status(403).json({ error: 'Access denied. You can only assign roles to users in your tenant.' });
            return;
        }
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: { role },
        });
        res.status(200).json({
            message: 'Roles assigned successfully',
            user: updatedUser
        });
    }
    catch (error) {
        console.error('Failed to assign roles:', error.message);
        res.status(500).json({ error: 'Failed to assign roles', details: 'An unexpected error occurred' });
    }
};
exports.assignRole = assignRole;
// Remove Roles
const removeRoles = async (req, res) => {
    const { userId, rolesToRemove } = req.body;
    const { role: requesterRole, tenantId: requesterTenantId } = req.user;
    if (!userId) {
        res.status(400).json({ error: 'User ID is required' });
        return;
    }
    if (!Array.isArray(rolesToRemove)) {
        res.status(400).json({ error: 'Roles to remove must be an array' });
        return;
    }
    if (!Array.isArray(requesterRole)) {
        res.status(400).json({ error: 'Requester roles must be an array' });
        return;
    }
    const validRoles = Object.keys(role_1.default);
    const invalidRoles = rolesToRemove.filter(role => !validRoles.includes(role));
    if (invalidRoles.length > 0) {
        res.status(400).json({ error: 'Invalid roles specified for removal', details: invalidRoles.join(', ') });
        return;
    }
    try {
        const userToUpdate = await prisma.user.findUnique({
            where: { id: userId },
            select: { tenantId: true, role: true },
        });
        if (!userToUpdate) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        if (userToUpdate.tenantId !== requesterTenantId) {
            res.status(403).json({ error: 'Access denied. You can only remove roles from users in your tenant.' });
            return;
        }
        const currentRoles = Array.isArray(userToUpdate.role) ? userToUpdate.role : [];
        const updatedRoles = currentRoles.filter(role => !rolesToRemove.includes(role));
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: { role: updatedRoles },
        });
        res.status(200).json({ message: 'Roles removed successfully', user: updatedUser });
    }
    catch (error) {
        console.error('Failed to remove roles:', error.message);
        res.status(500).json({ error: 'Failed to remove roles', details: 'An unexpected error occurred' });
    }
};
exports.removeRoles = removeRoles;
// Update User Details
const updateUserDetails = async (req, res) => {
    const { userId, firstName, lastName, email, phoneNumber, gender, county, town, password, currentPassword } = req.body;
    const { id: requesterId, role: requesterRole, tenantId: requesterTenantId } = req.user;
    if (!requesterId) {
        res.status(401).json({ error: 'Authentication failed: No user ID in request' });
        return;
    }
    const targetUserId = userId || requesterId;
    const isAdmin = requesterRole?.includes('ADMIN');
    const isSelfUpdate = targetUserId === requesterId;
    if (!isAdmin && !isSelfUpdate) {
        res.status(403).json({ message: 'Access denied. Only admins or the user themselves can update details.' });
        return;
    }
    const updateData = {};
    if (firstName)
        updateData.firstName = firstName;
    if (lastName)
        updateData.lastName = lastName;
    if (email)
        updateData.email = email;
    if (phoneNumber)
        updateData.phoneNumber = phoneNumber;
    if (gender)
        updateData.gender = gender;
    if (county)
        updateData.county = county;
    if (town)
        updateData.town = town;
    try {
        const userToUpdate = await prisma.user.findUnique({
            where: { id: targetUserId },
            select: { tenantId: true, password: true },
        });
        if (!userToUpdate) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        if (isAdmin && userToUpdate.tenantId !== requesterTenantId) {
            res.status(403).json({ error: 'Access denied. You can only update users in your tenant.' });
            return;
        }
        if (password) {
            if (!currentPassword) {
                res.status(400).json({ error: 'Current password is required to update password' });
                return;
            }
            const isValid = await bcrypt_1.default.compare(currentPassword, userToUpdate.password);
            if (!isValid) {
                res.status(401).json({ error: 'Current password is incorrect' });
                return;
            }
            updateData.password = await bcrypt_1.default.hash(password, 10);
        }
        const updatedUser = await prisma.user.update({
            where: { id: targetUserId },
            data: updateData,
        });
        res.status(200).json({ message: 'User details updated successfully', user: updatedUser });
    }
    catch (error) {
        console.error('Failed to update user details:', error.message);
        res.status(500).json({ error: 'Failed to update user details', details: error.message });
    }
};
exports.updateUserDetails = updateUserDetails;
// Delete User
const deleteUser = async (req, res) => {
    const { userId } = req.params;
    const { tenantId: requesterTenantId, role: requesterRole, id: requesterId } = req.user;
    const userIdInt = parseInt(userId, 10);
    const requesterIdInt = requesterId;
    if (isNaN(userIdInt)) {
        res.status(400).json({ error: 'Invalid user ID' });
        return;
    }
    if (userIdInt === requesterIdInt) {
        res.status(403).json({ error: 'You cannot delete your own account' });
        return;
    }
    if (!requesterRole.includes('ADMIN')) {
        const userToDelete = await prisma.user.findUnique({
            where: { id: userIdInt },
            select: { tenantId: true },
        });
        if (!userToDelete) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        if (userToDelete.tenantId !== requesterTenantId) {
            res.status(403).json({ error: 'Access denied. You can only delete users in your tenant.' });
            return;
        }
    }
    try {
        await prisma.user.delete({
            where: { id: userIdInt },
        });
        res.status(200).json({ message: 'User deleted successfully' });
    }
    catch (error) {
        console.error('Failed to delete user:', error.message);
        res.status(500).json({ error: 'Failed to delete user', details: error.message });
    }
};
exports.deleteUser = deleteUser;
// Strip Roles
const stripRoles = async (req, res) => {
    const { userId } = req.body;
    const { id: requesterId, role: requesterRole } = req.user;
    if (requesterId === userId) {
        res.status(400).json({ message: 'You cannot strip your own roles.' });
        return;
    }
    if (!requesterRole.includes('ADMIN')) {
        res.status(403).json({ message: 'Access denied. Only admins can strip roles.' });
        return;
    }
    try {
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: { role: [] },
        });
        res.status(200).json({ message: 'All roles stripped from user', user: updatedUser });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to strip roles', details: error.message });
    }
};
exports.stripRoles = stripRoles;
// Fetch User
const fetchUser = async (req, res) => {
    const { userId } = req.params;
    const { tenantId, role } = req.user;
    try {
        const user = await prisma.user.findFirst({
            where: {
                id: parseInt(userId, 10),
                tenantId,
            },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phoneNumber: true,
                gender: true,
                county: true,
                town: true,
                role: true,
                organizationId: true,
                organization: true,
                employeeId: true,
                employee: true,
                status: true,
                createdAt: true,
                updatedAt: true,
            },
        });
        if (!user) {
            res.status(404).json({ error: 'User not found or does not belong to your tenant.' });
            return;
        }
        res.status(200).json({ user });
    }
    catch (error) {
        console.error('Error fetching user details:', error);
        res.status(500).json({ error: 'Failed to fetch user details.', details: error.message });
    }
};
exports.fetchUser = fetchUser;
