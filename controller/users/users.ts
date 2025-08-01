import { Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { sendSMS } from '../sms/sms'; // Adjust path
import ROLE_PERMISSIONS from '../../DatabaseConfig/role'; // Adjust path
import { AuthenticatedRequest } from '../../middleware/verifyToken';

const prisma = new PrismaClient();

export const registerUser = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { employeeId, phoneNumber, idNumber, password } = req.body;
  const { tenantId } = req.user!;

  if (!req.user!.role.includes('ORG_ADMIN') && !req.user!.role.includes('ADMIN')) {
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
    } else {
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
    if (!ROLE_PERMISSIONS[defaultRole]) {
      res.status(500).json({ message: 'Default role is not defined in ROLE_PERMISSIONS' });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);


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
        createdBy: req.user!.id || null,
        lastLogin: new Date(),
        status: 'ACTIVE',
        tenantName: tenant.name || null,
        tenant: {
          connect: { id: tenantId },
        },
      },
    });

    const welcomeMessage = `Welcome to ${tenant.name}! Your account has been created. Your password is: ${password}`;
    await sendSMS(tenantId, employee.phoneNumber, welcomeMessage);

    res.status(201).json({ message: 'User created successfully', user: newUser });
  } catch (error) {
    console.error('Error creating user:', error);
    next(error);
  }
};


export const createOrgAdmin = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { firstName, lastName, phoneNumber, email, password, organizationId } = req.body;
  const { tenantId } = req.user!;

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
      console.error(
        `Access denied: Organization tenantId ${organization.tenantId} does not match requested tenantId ${tenantId}`
      );
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

    const hashedPassword = await bcrypt.hash(password, 10);

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
  } catch (error) {
    console.error('Failed to create Org Admin:', error);
    next(error);
  }
};

// Other controllers (getUsers, getUserProfile, updateUser, updateOwnProfile, deleteUser)
// Follow similar pattern: add types, include next parameter, return Promise<void>, use next(error) for errors

export const getUsers = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { tenantId, organizationId, role } = req.query as {
    tenantId?: string;
    organizationId?: string;
    role?: string;
  };

  try {
    if (tenantId && parseInt(tenantId) !== req.user!.tenantId) {
      console.error(
        `Access denied: User tenantId ${req.user!.tenantId} does not match requested tenantId ${tenantId}`
      );
      res.status(403).json({ error: 'You can only view users in your tenant' });
      return;
    }

    let users;
    if (req.user!.role.includes('ORG_ADMIN') && organizationId) {
      if (parseInt(organizationId) !== req.user!.organizationId) {
        console.error(
          `Access denied: User organizationId ${req.user!.organizationId} does not match requested organizationId ${organizationId}`
        );
        res.status(403).json({ error: 'You can only view users in your borrower organization' });
        return;
      }
      users = await prisma.user.findMany({
        where: {
          tenantId: parseInt(tenantId!),
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
    } else {
      users = await prisma.user.findMany({
        where: {
          tenantId: parseInt(tenantId!),
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
  } catch (error) {
    console.error('Failed to fetch users:', error);
    next(error);
  }
};

// Add similar TypeScript conversions for getUserProfile, updateUser, updateOwnProfile, deleteUser
// (Omitted for brevity, but follow the same pattern: use AuthenticatedRequest, return Promise<void>, pass errors to next)

export default {
  registerUser,
  createOrgAdmin,
  getUsers,
  // getUserProfile,
  // updateUser,
  // updateOwnProfile,
  // deleteUser,
};