import { PrismaClient, User, Organization, Employee ,UserStatus} from '@prisma/client';
import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { AuthenticatedRequest } from '../../middleware/verifyToken';
import { Loan } from '../../types/loans/loan';
import ROLE_PERMISSIONS from '../../DatabaseConfig/role';

// Define type for ROLE_PERMISSIONS (replace with actual import path)


// Define type for external getUserOrganizationIdById function
interface GetUserOrganizationIdById {
  (userId: number): Promise<number | null>;
}

// Mock implementation (replace with actual import)
const getUserOrganizationIdById: GetUserOrganizationIdById = async (userId: number) => {
  // Replace with actual implementation or import
  throw new Error('getUserOrganizationIdById not implemented');
};

const prisma = new PrismaClient();



interface APIResponse<T = any> {
  message?: string;
  error?: string;
  details?: string;
  user?: T;
  users?: T[];
  
}

interface UserInput {
  userId?: number;
  firstName?: string;
  lastName?: string;
  email?: string;
  phoneNumber?: string;
  gender?: string;
  county?: string;
  town?: string;
  password?: string;
  currentPassword?: string;
}


interface UserSummary {
  id: number;
  firstName?: string;
  lastName?: string;
  email?: string | null;
  phoneNumber?: string ;
  gender?: string | null;
  county?: string | null;
  town?: string | null;
  role?: string[];
  status?: UserStatus;
  createdAt?: Date;
  updatedAt?: Date;
  lastLogin?: Date | null;
  loginCount?: number;
}


// Get Current User
const getCurrentUser = async (req: AuthenticatedRequest, res: Response<APIResponse<UserSummary>>): Promise<void> => {
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

    res.json({user: loggedUser});
  } catch (error: any) {
    console.error('Error fetching current user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get All Users
const getAllUsers = async (req: AuthenticatedRequest, res: Response<APIResponse<UserSummary>>): Promise<void> => {
  const { tenantId } = req.user!;

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
  } catch (error: any) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users', details: error.message });
  }
};

// Assign Role
const assignRole = async (req: AuthenticatedRequest, res: Response<APIResponse<UserInput>>): Promise<void> => {
  const { userId, role } = req.body as { userId: number; role: string[] };
  const { role: requesterRole, tenantId: requesterTenantId } = req.user!;

  if (!userId) {
    res.status(400).json({ error: 'User ID is required' });
    return;
  }

  if (!Array.isArray(requesterRole)) {
    res.status(400).json({ error: 'Roles must be an array' });
    return;
  }

  const validRoles = Object.keys(ROLE_PERMISSIONS);
  const invalidRoles = role.filter(r => !validRoles.includes(r));

  if (invalidRoles.length > 0) {
    res.status(400).json({ error: 'Invalid roles'});
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
  user: updatedUser as UserInput
});
  } catch (error: any) {
    console.error('Failed to assign roles:', error.message);
    res.status(500).json({ error: 'Failed to assign roles', details: 'An unexpected error occurred' });
  }
};

// Remove Roles
const removeRoles = async (req: AuthenticatedRequest, res: Response<APIResponse<User>>): Promise<void> => {
  const { userId, rolesToRemove } = req.body as { userId: number; rolesToRemove: string[] };
  const { role: requesterRole, tenantId: requesterTenantId } = req.user!;

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

  const validRoles = Object.keys(ROLE_PERMISSIONS);
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
  } catch (error: any) {
    console.error('Failed to remove roles:', error.message);
    res.status(500).json({ error: 'Failed to remove roles', details: 'An unexpected error occurred' });
  }
};

// Update User Details
const updateUserDetails = async (req: AuthenticatedRequest, res: Response<APIResponse<User>>): Promise<void> => {
  const { userId, firstName, lastName, email, phoneNumber, gender, county, town, password, currentPassword } = req.body as UserInput;
  const { id: requesterId, role: requesterRole, tenantId: requesterTenantId } = req.user!;

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

  const updateData: Partial<User> = {};
  if (firstName) updateData.firstName = firstName;
  if (lastName) updateData.lastName = lastName;
  if (email) updateData.email = email;
  if (phoneNumber) updateData.phoneNumber = phoneNumber;
  if (gender) updateData.gender = gender;
  if (county) updateData.county = county;
  if (town) updateData.town = town;

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
      const isValid = await bcrypt.compare(currentPassword, userToUpdate.password);
      if (!isValid) {
        res.status(401).json({ error: 'Current password is incorrect' });
        return;
      }
      updateData.password = await bcrypt.hash(password, 10);
    }

    const updatedUser = await prisma.user.update({
      where: { id: targetUserId },
      data: updateData,
    });

    res.status(200).json({ message: 'User details updated successfully', user: updatedUser });
  } catch (error: any) {
    console.error('Failed to update user details:', error.message);
    res.status(500).json({ error: 'Failed to update user details', details: error.message });
  }
};

// Delete User
const deleteUser = async (req: AuthenticatedRequest & { params: { userId: string } }, res: Response<APIResponse>): Promise<void> => {
  const { userId } = req.params;
  const { tenantId: requesterTenantId, role: requesterRole, id: requesterId } = req.user!;

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
  } catch (error: any) {
    console.error('Failed to delete user:', error.message);
    res.status(500).json({ error: 'Failed to delete user', details: error.message });
  }
};

// Strip Roles
const stripRoles = async (req: AuthenticatedRequest, res: Response<APIResponse<User>>): Promise<void> => {
  const { userId } = req.body as { userId: number };
  const { id: requesterId, role: requesterRole } = req.user!;

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
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to strip roles', details: error.message });
  }
};

// Fetch User
const fetchUser = async (req: AuthenticatedRequest & { params: { userId: string } }, res: Response<APIResponse<UserSummary >>): Promise<void> => {
  const { userId } = req.params;
  const { tenantId, role } = req.user!;

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
    Organization: true,
    employeeId: true,
    Employee: true,
    
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
  } catch (error: any) {
    console.error('Error fetching user details:', error);
    res.status(500).json({ error: 'Failed to fetch user details.', details: error.message });
  }
};

export {
  getAllUsers,
  assignRole,
  deleteUser,
  stripRoles,
  updateUserDetails,
  fetchUser,
  removeRoles,
  getCurrentUser,
  getUserOrganizationIdById,
};