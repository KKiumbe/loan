const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const createEmployee = async (req, res) => {
  const {
    
    organizationId,
    phoneNumber,
    idNumber,
    firstName,
    lastName,
  } = req.body;

  try {
    // Tenant scoping
 console.log(`this is the req object' ${JSON.stringify(req.user)}`)
const {tenantId} = req.user
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

    // Borrower organization scoping for ORG_ADMIN
    if (req.user.role.includes('ORG_ADMIN') && organizationId !== req.user.organizationId) {
      console.error(`Access denied: User organizationId ${req.user.organizationId} does not match requested organizationId ${organizationId}`);
      return res.status(403).json({ error: 'You can only create employees in your borrower organization' });
    }

    // Validate inputs
    if (!phoneNumber || !idNumber || !firstName || !lastName || !grossSalary) {
      console.error('Missing required fields');
      return res.status(400).json({ error: 'phoneNumber, idNumber, firstName, lastName, and grossSalary are required' });
    }
    if (grossSalary <= 0) {
      console.error(`Invalid grossSalary: ${grossSalary}`);
      return res.status(400).json({ error: 'Gross salary must be a positive number' });
    }

    // Check for duplicate phoneNumber or idNumber
    const existingEmployee = await prisma.employee.findFirst({
      where: { OR: [{ phoneNumber }, { idNumber }] },
    });
    if (existingEmployee) {
      console.error(`Employee already exists: phoneNumber ${phoneNumber} or idNumber ${idNumber}`);
      return res.status(400).json({ error: 'Phone number or ID number already in use' });
    }

    const employee = await prisma.employee.create({
      data: {
        tenantId,
        organizationId,
        phoneNumber,
        idNumber,
        firstName,
        lastName,
        grossSalary,
        jobId,
        secondaryPhoneNumber,
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: req.user.user,
        action: 'CREATE_EMPLOYEE',
        resource: 'Employee',
        details: { employeeId: employee.id, phoneNumber, idNumber, firstName, lastName, grossSalary, jobId, secondaryPhoneNumber },
      },
    });

    console.log(`Employee created: employeeId ${employee.id}`);
    res.status(201).json({ message: 'Employee created successfully', employee });
  } catch (error) {
    console.error('Failed to create employee:', error.message);
    res.status(500).json({ error: 'Failed to create employee' });
  }
};

const getEmployee = async (req, res) => {
  const { employeeId } = req.params;

  try {
    const employee = await prisma.employee.findUnique({
      where: { id: parseInt(employeeId) },
      include: { user: true, tenant: true, organization: true },
    });
    if (!employee) {
      console.error(`Employee not found: employeeId ${employeeId}`);
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Tenant scoping
    if (employee.tenantId !== req.user.tenantId) {
      console.error(`Access denied: User tenantId ${req.user.tenantId} does not match employee tenantId ${employee.tenantId}`);
      return res.status(403).json({ error: 'You can only view employees in your tenant' });
    }

    // Borrower organization scoping for ORG_ADMIN
    if (req.user.role.includes('ORG_ADMIN') && employee.organizationId !== req.user.organizationId) {
      console.error(`Access denied: User organizationId ${req.user.organizationId} does not match employee organizationId ${employee.organizationId}`);
      return res.status(403).json({ error: 'You can only view employees in your borrower organization' });
    }

    // Self-specific scoping for EMPLOYEE
    if (req.user.role.includes('EMPLOYEE') && employee.user?.id !== req.user.id) {
      console.error(`Access denied: User ${req.user.id} cannot view employee ${employeeId}`);
      return res.status(403).json({ error: 'You can only view your own employee record' });
    }

    console.log(`Fetched employee: employeeId ${employeeId}`);
    res.status(200).json({ employee });
  } catch (error) {
    console.error('Failed to fetch employee:', error.message);
    res.status(500).json({ error: 'Failed to fetch employee' });
  }
};

const updateEmployee = async (req, res) => {
  const { employeeId } = req.params;
  const { phoneNumber, idNumber, firstName, lastName, grossSalary, jobId, secondaryPhoneNumber } = req.body;

  try {
    const employee = await prisma.employee.findUnique({
      where: { id: parseInt(employeeId) },
      include: { user: true },
    });
    if (!employee) {
      console.error(`Employee not found: employeeId ${employeeId}`);
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Tenant scoping
    if (employee.tenantId !== req.user.tenantId) {
      console.error(`Access denied: User tenantId ${req.user.tenantId} does not match employee tenantId ${employee.tenantId}`);
      return res.status(403).json({ error: 'You can only update employees in your tenant' });
    }

    // Borrower organization scoping for ORG_ADMIN
    if (req.user.role.includes('ORG_ADMIN') && employee.organizationId !== req.user.organizationId) {
      console.error(`Access denied: User organizationId ${req.user.organizationId} does not match employee organizationId ${employee.organizationId}`);
      return res.status(403).json({ error: 'You can only update employees in your borrower organization' });
    }

    // Self-specific scoping for EMPLOYEE
    if (req.user.role.includes('EMPLOYEE') && employee.user?.id !== req.user.id) {
      console.error(`Access denied: User ${req.user.id} cannot update employee ${employeeId}`);
      return res.status(403).json({ error: 'You can only update your own employee record' });
    }

    // Validate inputs
    if (grossSalary !== undefined && grossSalary <= 0) {
      console.error(`Invalid grossSalary: ${grossSalary}`);
      return res.status(400).json({ error: 'Gross salary must be a positive number' });
    }
    if (phoneNumber) {
      const existingPhone = await prisma.employee.findFirst({
        where: { phoneNumber, NOT: { id: parseInt(employeeId) } },
      });
      if (existingPhone) {
        console.error(`Phone number already in use: ${phoneNumber}`);
        return res.status(400).json({ error: 'Phone number already in use' });
      }
    }
    if (idNumber) {
      const existingId = await prisma.employee.findFirst({
        where: { idNumber, NOT: { id: parseInt(employeeId) } },
      });
      if (existingId) {
        console.error(`ID number already in use: ${idNumber}`);
        return res.status(400).json({ error: 'ID number already in use' });
      }
    }

    const updateData = {};
    if (phoneNumber) updateData.phoneNumber = phoneNumber;
    if (idNumber) updateData.idNumber = idNumber;
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (grossSalary !== undefined) updateData.grossSalary = grossSalary;
    if (jobId !== undefined) updateData.jobId = jobId;
    if (secondaryPhoneNumber !== undefined) updateData.secondaryPhoneNumber = secondaryPhoneNumber;

    const updatedEmployee = await prisma.employee.update({
      where: { id: parseInt(employeeId) },
      data: updateData,
    });

    // If employee has a linked User, update User to match firstName, lastName, and phoneNumber
    if (employee.user && (firstName || lastName || phoneNumber)) {
      const userUpdateData = {};
      if (firstName) userUpdateData.firstName = firstName;
      if (lastName) userUpdateData.lastName = lastName;
      if (phoneNumber) {
        const existingUserPhone = await prisma.user.findFirst({
          where: { phoneNumber, NOT: { id: employee.user.id } },
        });
        if (existingUserPhone) {
          console.error(`User phone number already in use: ${phoneNumber}`);
          return res.status(400).json({ error: 'User phone number already in use' });
        }
        userUpdateData.phoneNumber = phoneNumber;
      }

      if (Object.keys(userUpdateData).length > 0) {
        await prisma.user.update({
          where: { id: employee.user.id },
          data: userUpdateData,
        });
      }
    }

    await prisma.auditLog.create({
      data: {
        tenantId: employee.tenantId,
        userId: req.user.id,
        action: 'UPDATE_EMPLOYEE',
        resource: 'Employee',
        details: { employeeId, changes: updateData },
      },
    });

    console.log(`Employee updated: employeeId ${employeeId}`);
    res.status(200).json({ message: 'Employee updated successfully', employee: updatedEmployee });
  } catch (error) {
    console.error('Failed to update employee:', error.message);
    res.status(500).json({ error: 'Failed to update employee' });
  }
};

const deleteEmployee = async (req, res) => {
  const { employeeId } = req.params;

  try {
    const employee = await prisma.employee.findUnique({
      where: { id: parseInt(employeeId) },
      include: { user: true },
    });
    if (!employee) {
      console.error(`Employee not found: employeeId ${employeeId}`);
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Tenant scoping
    if (employee.tenantId !== req.user.tenantId) {
      console.error(`Access denied: User tenantId ${req.user.tenantId} does not match employee tenantId ${employee.tenantId}`);
      return res.status(403).json({ error: 'You can only delete employees in your tenant' });
    }

    // Borrower organization scoping for ORG_ADMIN
    if (req.user.role.includes('ORG_ADMIN') && employee.organizationId !== req.user.organizationId) {
      console.error(`Access denied: User organizationId ${req.user.organizationId} does not match employee organizationId ${employee.organizationId}`);
      return res.status(403).json({ error: 'You can only delete employees in your borrower organization' });
    }

    // Delete Employee and associated User (if exists) in a transaction
    if (employee.user) {
      await prisma.$transaction([
        prisma.user.delete({ where: { id: employee.user.id } }),
        prisma.employee.delete({ where: { id: parseInt(employeeId) } }),
      ]);
    } else {
      await prisma.employee.delete({ where: { id: parseInt(employeeId) } });
    }

    await prisma.auditLog.create({
      data: {
        tenantId: employee.tenantId,
        userId: req.user.id,
        action: 'DELETE_EMPLOYEE',
        resource: 'Employee',
        details: { employeeId, userId: employee.user?.id },
      },
    });

    console.log(`Employee deleted: employeeId ${employeeId}`);
    res.status(200).json({ message: 'Employee deleted successfully' });
  } catch (error) {
    console.error('Failed to delete employee:', error.message);
    res.status(500).json({ error: 'Failed to delete employee' });
  }
};

module.exports = {
  createEmployee,
  getEmployee,
  updateEmployee,
  deleteEmployee,
};