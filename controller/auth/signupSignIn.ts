import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import ROLE_PERMISSIONS from '../../DatabaseConfig/role';
import  configureTenantSettings  from '../smsConfig/config';
import connect  from '../../routes/userRoute/userRoute';
const prisma = new PrismaClient();
dotenv.config();
import { Request, Response } from 'express';
import { NewTenant, NewUser, SignInRequestBody, TransactionResult } from '../../types/auth';



// 2. Main register function
export const register = async (req: Request, res: Response) => {
  const {
    firstName,
    lastName,
    phoneNumber,
    email,
    county,
    town,
    gender,
    password,
    tenantName,
  } = req.body;

  try {
    // Validate required fields
    if (!firstName || !lastName || !phoneNumber || !email || !password || !tenantName) {
      return res.status(400).json({
        message: 'All fields (firstName, lastName, phoneNumber, email, password, tenantName) are required',
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    if (phoneNumber.length < 9 || !/^\d+$/.test(phoneNumber)) {
      return res.status(400).json({ message: 'Phone number must be numeric and at least 9 digits' });
    }

    // Check for existing user
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ phoneNumber }, { email }],
      },
    });

    if (existingUser) {
      const conflictField = existingUser.phoneNumber === phoneNumber ? 'Phone number' : 'Email';
      return res.status(400).json({ message: `${conflictField} is already registered` });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Default roles
    const defaultRoles = ['ADMIN'];

    // Validate roles
    const validRoles = Object.keys(ROLE_PERMISSIONS);
    const invalidRoles = defaultRoles.filter(role => !validRoles.includes(role));

    if (invalidRoles.length > 0) {
      return res.status(400).json({
        message: `Invalid roles: ${invalidRoles.join(', ')}. Must be defined in ROLE_PERMISSIONS`,
      });
    }

    // Transaction to create tenant and user
 

    const { user, tenant }: TransactionResult = await prisma.$transaction(async (prisma:any) => {
      const newTenant: NewTenant = await prisma.tenant.create({
      data: {
        name: tenantName,
        subscriptionPlan: 'Default Plan',
        monthlyCharge: 0.0,
        status: 'ACTIVE',
      },
      });

         const newOrg = await prisma.organization.create({
        data: {
          name: tenantName || `${tenantName} Org`,
          tenantId: newTenant.id,
          isGlobalLenderOrg: true,
        },
      });


      const newUser: NewUser = await prisma.user.create({
      data: {
        firstName,
        lastName,
        phoneNumber,
        email,
        county: county ?? null,
        town: town ?? null,
        gender: gender ?? null,
        password: hashedPassword,
        tenantName,
        organization: { connect: { id: newOrg.id } },
        role: defaultRoles,
        tenant: {
        connect: { id: newTenant.id },
        },
        lastLogin: new Date(),
        loginCount: 1,
        status: 'ACTIVE',
      },
      });

      await prisma.auditLog.create({
      data: {
        tenant: { connect: { id: newTenant.id } },
        user: { connect: { id: newUser.id } },
        action: 'CREATE',
        resource: 'USER_TENANT',
        details: { message: `User ${newUser.email} created tenant ${tenantName}` },
      },
      });

      return { user: newUser, tenant: newTenant };
    });

    // Configure tenant settings
    try {
      await configureTenantSettings(Number(tenant.id));
    } catch (configError) {
      console.warn(`Failed to configure tenant settings for tenant ${tenant.id}:`, configError);
    }

    // Success response
    res.status(201).json({
      message: 'User and tenant created successfully',
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        role: user.role,
        tenantId: tenant.id,
      },
      tenant: {
        id: tenant.id,
        name: tenant.name,
      },
    });
  } catch (error: any) {
    console.error('Error registering user and tenant:', error);
    if (error.code === 'P2002') {
      return res.status(400).json({ message: 'Email, phone number, or tenant name already exists' });
    }
    res.status(500).json({ message: 'Internal server error', error: error.message });
  } finally {
    await prisma.$disconnect();
  }
};







// Main signin function
export const signin = async (req: { body: SignInRequestBody }, res: any) => {
  const { phoneNumber, password } = req.body;

  try {
    // Input validation
    if (!phoneNumber || !password) {
      return res.status(400).json({ message: 'Phone number and password are required' });
    }

    // Find the user
    const user = await prisma.user.findUnique({
      where: { phoneNumber },
      select: {
        id:             true,
        firstName:      true,
        lastName:       true,
        phoneNumber:    true,
        password:       true,
        role:           true,
        organizationId: true,
        employeeId:     true,
        email:          true,
        tenantId:       true,
        tenant: {
          select: { id: true, name: true },
        },
      },
    });

    if (!user) {
      return res.status(401).json({ message: 'Invalid phone number or password' });
    }

    // Compare password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid phone number or password' });
    }

    // Update login info
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLogin: new Date(),
        loginCount: { increment: 1 },
      },
    });

    // Log login action
    await prisma.auditLog.create({
      data: {
        tenant:  { connect: { id: user.tenantId } },
        user:    { connect: { id: user.id } },
        action:   'LOGIN',
        resource: 'user',
        details:  { message: `User ${user.firstName} logged in` },
      },
    });

 if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is not set');
}


    const token = jwt.sign(
      {
        id:             user.id,
        firstName:      user.firstName,
        lastName:       user.lastName,
        email:          user.email,
        phoneNumber:    user.phoneNumber,
        role:           user.role,
        organizationId: user.organizationId,
        employeeId:     user.employeeId,
        tenantId:       user.tenantId,
        tenantName:     user.tenant.name,
      },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000, // 1 day
    });

    // Return user info (excluding password)
    const { password: _, ...userInfo } = user;
    res.status(200).json({ message: 'Login successful', user: userInfo });

  } catch (error: any) {
    console.error('Error logging in:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  } finally {
    await prisma.$disconnect();
  }
};




module.exports = { register, signin };