const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const ROLE_PERMISSIONS = require('../../DatabaseConfig/role'); // Path to the role permissions file
const { sendSMS } = require('../sms/sms');
const {  getUserOrganizationIdById } = require('../../routes/userRoute/getOrgId');




const registerUser = async (req, res) => {
  const { phoneNumber, idNumber, password } = req.body;
  const { tenantId } = req.user;
  console.log(`this is user object ${JSON.stringify(req.user)}`);
  console.log(`tenant id ${tenantId}`);

 if (!req.user.role.includes('ORG_ADMIN') && !req.user.role.includes('ADMIN')) {
  return res.status(403).json({ message: 'Access denied. Only admins can create users.' });
}


  // Validate required fields
  if ((!phoneNumber && !idNumber) || !password || !tenantId) {
    return res.status(400).json({ message: 'Either phoneNumber or idNumber, password, are required' });
  }

  try {
    // Check if the tenant exists
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true }, // Fetch only id and name
    });

    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }

    // Find the employee by phoneNumber or idNumber
    const employee = await prisma.employee.findFirst({
      where: {
        OR: [
          phoneNumber ? { phoneNumber } : {},
          idNumber ? { idNumber } : {},
        ].filter(Boolean),
        tenantId,
      },
    });

    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    // Check if a user already exists for this employee
    const existingUser = await prisma.user.findFirst({
      where: { employeeId: employee.id },
    });

    if (existingUser) {
      return res.status(400).json({ message: 'User already exists for this employee' });
    }

    // Check if the phone number or email is already used by another user
    const userByPhoneOrEmail = await prisma.user.findFirst({
      where: {
        OR: [
          { phoneNumber: employee.phoneNumber },
          employee.email ? { email: employee.email } : {},
        ].filter(Boolean),
      },
    });

    if (userByPhoneOrEmail) {
      return res.status(400).json({ message: 'Phone number or email is already registered' });
    }

    // Define the default role
    const defaultRole = 'EMPLOYEE'; // Ensure this role exists in ROLE_PERMISSIONS
    if (!ROLE_PERMISSIONS[defaultRole]) {
      return res.status(500).json({ message: 'Default role is not defined in ROLE_PERMISSIONS' });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create the new user
    const newUser = await prisma.user.create({
      data: {
        firstName: employee.firstName,
        lastName: employee.lastName,
        email: null, // Employee schema has no email field
        phoneNumber: employee.phoneNumber,
        password: hashedPassword,
        employee: { connect: { id: employee.id } },
        role: { set: [defaultRole] },
        createdBy: req.user.id || null, // Handle undefined createdBy
        lastLogin: new Date(),
        status: 'ACTIVE',
        tenantName: tenant.name || null, // Dynamically set tenantName
        tenant: {
          connect: { id: tenantId }, // Connect tenant relation
        },
      },
    });

    // Prepare and send SMS
    const welcomeMessage = `Welcome to ${tenant.name}! Your account has been created. Your password is: ${password}`;
    await sendSMS(tenantId, employee.phoneNumber, welcomeMessage);

    return res.status(201).json({ message: 'User created successfully', user: newUser });
  } catch (error) {
    console.error('Error creating user:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};



// Updated createOrgAdmin function

const createOrgAdmin = async (req, res) => {
  const { firstName, lastName, phoneNumber, email, password, organizationId} = req.body;

  try {
  const {tenantId} =req.user;

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      console.error(`Tenant not found: tenantId ${tenantId}`);
      return res.status(404).json({ error: 'Tenant (Lender Organization) not found' });
    }

    const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
    if (!organization) {
      console.error(`Borrower Organization not found: organizationId ${organizationId}`);
      return res.status(404).json({ error: 'Borrower Organization not found' });
    }

    // Verify organization belongs to tenant
    if (organization.tenantId !== tenantId) {
      console.error(`Access denied: Organization tenantId ${organization.tenantId} does not match requested tenantId ${tenantId}`);
      return res.status(403).json({ error: 'Organization does not belong to this tenant' });
    }

    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ email }, { phoneNumber }] },
    });
    if (existingUser) {
      console.error(`User already exists: email ${email} or phoneNumber ${phoneNumber}`);
      return res.status(400).json({ error: 'Email or phone number already in use' });
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
    console.error('Failed to create Org Admin:', error.message);
    res.status(500).json({ error: 'Failed to create Org Admin' });
  }
};







const getUsers = async (req, res) => {
  const { tenantId, organizationId, role } = req.query;

  try {
    // Tenant scoping
    if (tenantId && parseInt(tenantId) !== req.user.tenantId) {
      console.error(`Access denied: User tenantId ${req.user.tenantId} does not match requested tenantId ${tenantId}`);
      return res.status(403).json({ error: 'You can only view users in your tenant' });
    }

    let users;
    if (req.user.role.includes('ORG_ADMIN') && organizationId) {
      // Borrower organization scoping for ORG_ADMIN
      if (parseInt(organizationId) !== req.user.organizationId) {
        console.error(`Access denied: User organizationId ${req.user.organizationId} does not match requested organizationId ${organizationId}`);
        return res.status(403).json({ error: 'You can only view users in your borrower organization' });
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
    } else {
      users = await prisma.user.findMany({
        where: {
          tenantId: parseInt(tenantId),
          role: { has: role || undefined },
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
    console.error('Failed to fetch users:', error.message);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

const getUserProfile = async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await prisma.user.findUnique({
      where: { id: parseInt(userId) },
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
    if (!user) {
      console.error(`User not found: userId ${userId}`);
      return res.status(404).json({ error: 'User not found' });
    }

    // Tenant scoping
    if (user.tenantId !== req.user.tenantId) {
      console.error(`Access denied: User tenantId ${req.user.tenantId} does not match target user tenantId ${user.tenantId}`);
      return res.status(403).json({ error: 'You can only view users in your tenant' });
    }

    // Borrower organization scoping for ORG_ADMIN
    if (req.user.role.includes('ORG_ADMIN') && user.organizationId !== req.user.organizationId) {
      console.error(`Access denied: User organizationId ${req.user.organizationId} does not match target user organizationId ${user.organizationId}`);
      return res.status(403).json({ error: 'You can only view users in your borrower organization' });
    }

    // Self-specific scoping for EMPLOYEE
    if (req.user.role.includes('EMPLOYEE') && parseInt(userId) !== req.user.id) {
      console.error(`Access denied: User ${req.user.id} cannot view profile of user ${userId}`);
      return res.status(403).json({ error: 'You can only view your own profile' });
    }

    console.log(`Fetched user profile: userId ${userId}`);
    res.status(200).json({ user });
  } catch (error) {
    console.error('Failed to fetch user profile:', error.message);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
};

const updateUser = async (req, res) => {
  const { userId } = req.params;
  const { firstName, lastName, phoneNumber, email, password, role, status, organizationId } = req.body;

  try {
    const user = await prisma.user.findUnique({ where: { id: parseInt(userId) } });
    if (!user) {
      console.error(`User not found: userId ${userId}`);
      return res.status(404).json({ error: 'User not found' });
    }

    // Tenant scoping
    if (user.tenantId !== req.user.tenantId) {
      console.error(`Access denied: User tenantId ${req.user.tenantId} does not match target user tenantId ${user.tenantId}`);
      return res.status(403).json({ error: 'You can only update users in your tenant' });
    }

    // Borrower organization scoping for ORG_ADMIN
    if (req.user.role.includes('ORG_ADMIN') && user.organizationId !== req.user.organizationId) {
      console.error(`Access denied: User organizationId ${req.user.organizationId} does not match target user organizationId ${user.organizationId}`);
      return res.status(403).json({ error: 'You can only update users in your borrower organization' });
    }

    if (organizationId) {
      const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
      if (!organization) {
        console.error(`Borrower Organization not found: organizationId ${organizationId}`);
        return res.status(404).json({ error: 'Borrower Organization not found' });
      }
      // Verify organization belongs to tenant
      if (organization.tenantId !== req.user.tenantId) {
        console.error(`Access denied: Organization tenantId ${organization.tenantId} does not match user tenantId ${req.user.tenantId}`);
        return res.status(403).json({ error: 'Organization does not belong to this tenant' });
      }
    }

    const updateData = {};
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (phoneNumber) {
      const existingPhone = await prisma.user.findFirst({
        where: { phoneNumber, NOT: { id: parseInt(userId) } },
      });
      if (existingPhone) {
        console.error(`Phone number already in use: ${phoneNumber}`);
        return res.status(400).json({ error: 'Phone number already in use' });
      }
      updateData.phoneNumber = phoneNumber;
    }
    if (email) {
      const existingEmail = await prisma.user.findFirst({
        where: { email, NOT: { id: parseInt(userId) } },
      });
      if (existingEmail) {
        console.error(`Email already in use: ${email}`);
        return res.status(400).json({ error: 'Email already in use' });
      }
      updateData.email = email;
    }
    if (password) updateData.password = await bcrypt.hash(password, 10);
    if (role) updateData.role = role;
    if (status) updateData.status = status;
    if (organizationId) updateData.organizationId = organizationId;

    const updatedUser = await prisma.user.update({
      where: { id: parseInt(userId) },
      data: updateData,
    });

    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: req.user.id,
        action: 'UPDATE_USER',
        resource: 'User',
        details: { userId, changes: updateData },
      },
    });

    console.log(`User updated: userId ${userId}`);
    res.status(200).json({ message: 'User updated successfully', user: updatedUser });
  } catch (error) {
    console.error('Failed to update user:', error.message);
    res.status(500).json({ error: 'Failed to update user' });
  }
};

const updateOwnProfile = async (req, res) => {
  const { firstName, lastName, phoneNumber, email, password } = req.body;

  try {
    const updateData = {};
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (phoneNumber) {
      const existingPhone = await prisma.user.findFirst({
        where: { phoneNumber, NOT: { id: req.user.id } },
      });
      if (existingPhone) {
        console.error(`Phone number already in use: ${phoneNumber}`);
        return res.status(400).json({ error: 'Phone number already in use' });
      }
      updateData.phoneNumber = phoneNumber;
    }
    if (email) {
      const existingEmail = await prisma.user.findFirst({
        where: { email, NOT: { id: req.user.id } },
      });
      if (existingEmail) {
        console.error(`Email already in use: ${email}`);
        return res.status(400).json({ error: 'Email already in use' });
      }
      updateData.email = email;
    }
    if (password) updateData.password = await bcrypt.hash(password, 10);

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: updateData,
    });

    await prisma.auditLog.create({
      data: {
        tenantId: req.user.tenantId,
        userId: req.user.id,
        action: 'UPDATE_OWN_PROFILE',
        resource: 'User',
        details: { userId: req.user.id, changes: updateData },
      },
    });

    console.log(`Profile updated: userId ${req.user.id}`);
    res.status(200).json({ message: 'Profile updated successfully', user: updatedUser });
  } catch (error) {
    console.error('Failed to update profile:', error.message);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

const deleteUser = async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await prisma.user.findUnique({ where: { id: parseInt(userId) } });
    if (!user) {
      console.error(`User not found: userId ${userId}`);
      return res.status(404).json({ error: 'User not found' });
    }

    // Tenant scoping
    if (user.tenantId !== req.user.tenantId) {
      console.error(`Access denied: User tenantId ${req.user.tenantId} does not match target user tenantId ${user.tenantId}`);
      return res.status(403).json({ error: 'You can only delete users in your tenant' });
    }

    // Borrower organization scoping for ORG_ADMIN
    if (req.user.role.includes('ORG_ADMIN') && user.organizationId !== req.user.organizationId) {
      console.error(`Access denied: User organizationId ${req.user.organizationId} does not match target user organizationId ${user.organizationId}`);
      return res.status(403).json({ error: 'You can only delete users in your borrower organization' });
    }

    await prisma.user.delete({
      where: { id: parseInt(userId) },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: req.user.id,
        action: 'DELETE_USER',
        resource: 'User',
        details: { userId, email: user.email },
      },
    });

    console.log(`User deleted: userId ${userId}`);
    res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Failed to delete user:', error.message);
    res.status(500).json({ error: 'Failed to delete user' });
  }
};

module.exports = {
  createOrgAdmin,

  getUsers,
  getUserProfile,
  updateUser,
  updateOwnProfile,
  deleteUser,
  registerUser
};







