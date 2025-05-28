const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');
const ROLE_PERMISSIONS = require('../../DatabaseConfig/role.js');
const { configureTenantSettings } = require('../smsConfig/config.js');
const { connect } = require('../../routes/userRoute/userRoute.js');
const prisma = new PrismaClient();
dotenv.config();






const register = async (req, res) => {
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
    // Input validation
    if (!firstName || !lastName || !phoneNumber || !email || !password || !tenantName) {
      return res.status(400).json({ message: 'All fields (firstName, lastName, phoneNumber, email, password, tenantName) are required' });
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
    const invalidRoles = defaultRoles.filter((role) => !validRoles.includes(role));
    if (invalidRoles.length > 0) {
      return res.status(400).json({
        message: `Invalid roles: ${invalidRoles.join(', ')}. Must be defined in ROLE_PERMISSIONS`,
      });
    }

    // Transaction to create tenant and user
    const { user, tenant } = await prisma.$transaction(async (prisma) => {
      // Create tenant
      const newTenant = await prisma.tenant.create({
        data: {
          name: tenantName,
          subscriptionPlan: 'Default Plan',
          monthlyCharge: 0.0,
         // Will be updated later with user ID
          status: 'ACTIVE',
        },
      });

      // Create user
      const newUser = await prisma.user.create({
        data: {
          firstName,
          lastName,
          phoneNumber,
          email,
          county: county || null,
          town: town || null,
          gender: gender || null,
          password: hashedPassword,
          tenantName, // Set tenantName for user
          role: defaultRoles,
          //tenantId: newTenant.id,
          tenant: {
            connect: { id: newTenant.id }, // Explicitly connect tenant
          },
          lastLogin: new Date(),
          loginCount: 1,
          status: 'ACTIVE',
        },
      });

    

      // Log in AuditLog
      await prisma.auditLog.create({
        data: {
          tenant: {connect:{
            id:newTenant.id
          }},
          user: {connect:{
            id:newUser.id
          }},
          action: 'CREATE',
          resource: 'USER_TENANT',
          details: { message: `User ${newUser.email} created tenant ${tenantName}` },
        },
      });

      // Log in UserActivity
  

      return { user: newUser, tenant: newTenant };
    });

    // Configure tenant settings
    try {
      await configureTenantSettings(tenant.id);
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
  } catch (error) {
    console.error('Error registering user and tenant:', error);
    if (error.code === 'P2002') {
      return res.status(400).json({ message: 'Email, phone number, or tenant name already exists' });
    }
    res.status(500).json({ message: 'Internal server error', error: error.message });
  } finally {
    await prisma.$disconnect();
  }
};

const signin = async (req, res) => {
  const { phoneNumber, password } = req.body;

  try {
    // Input validation
    if (!phoneNumber || !password) {
      return res.status(400).json({ message: 'Phone number and password are required' });
    }

    // Find the user with explicit field selection
    const user = await prisma.user.findUnique({
      where: { phoneNumber },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        password: true,
        role: true,
        organizationId: true,
        //employeeId: true, // Include employeeId if exists
        email: true,
        
        tenantId: true,
        tenant: {
          select: { id: true, name: true },
        },
        employee:{
          select:{id:true,firstName:true}
        }
      
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

    // Update user login info
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLogin: new Date(),
        loginCount: { increment: 1 },
      },
    });

    // Log the login action
    await prisma.auditLog.create({
      data: {
        tenant: {connect:{
          id:user.tenantId
        }},
        user: {connect:{
          id:user.id
        }},
        action: 'LOGIN',
        resource:'user',
       
        details: { message: `User ${user.firstName} logged in` },
      },
    });
    // Generate JWT token
    const token = jwt.sign(
      {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        role: user.role,
        organizationId:user.organizationId ,
        tenantId: user.tenantId,
        tenantName: user.tenant.name,
        employee: user.employee ? {
          id: user.employee.id,
          employeeId: user.employee.id,
          firstName: user.employee.firstName
        } : null, // Include employee details if exists
      // Include employeeId if exists
      },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    // Set the token in an HTTP-only cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000,
    });

    // Exclude password from response
    const { password: userPassword, ...userInfo } = user;

    res.status(200).json({ message: 'Login successful', user: userInfo });
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  } finally {
    await prisma.$disconnect();
  }
};

module.exports = { register, signin };