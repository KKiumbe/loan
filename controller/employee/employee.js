const { PrismaClient } = require('@prisma/client');
const { connect } = require('mongoose');
const { getUserOrganizationIdById } = require('../../routes/userRoute/getOrgId');
const { sendSMS } = require('../sms/sms');

const prisma = new PrismaClient();







// Updated createEmployee function
const createEmployee = async (req, res) => {
  const { organizationId, phoneNumber, idNumber, grossSalary, firstName, lastName } = req.body;
  const { tenantId, role, id: userId } = req.user;

  try {
    // Role validation: Ensure user has ORG_ADMIN or ADMIN role
    if (!role.includes('ORG_ADMIN') && !role.includes('ADMIN')) {
      console.error(`Access denied: User ${userId} lacks required role (ORG_ADMIN or ADMIN)`);
      return res.status(403).json({ error: 'Access denied. Only ORG_ADMIN or ADMIN can create employees.' });
    }

    // Tenant scoping
    console.log(`Request user: ${JSON.stringify(req.user)}`);
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true },
    });
    if (!tenant) {
      console.error(`Tenant not found: tenantId ${tenantId}`);
      return res.status(404).json({ error: 'Tenant (Lender Organization) not found' });
    }

    // Check if organization exists
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, tenantId: true, name: true },
    });
    if (!organization) {
      console.error(`Borrower Organization not found: organizationId ${organizationId}`);
      return res.status(404).json({ error: 'Borrower Organization not found' });
    }

    // Verify organization belongs to tenant
    if (organization.tenantId !== tenantId) {
      console.error(`Access denied: Organization tenantId ${organization.tenantId} does not match requested tenantId ${tenantId}`);
      return res.status(403).json({ error: 'Organization does not belong to this tenant' });
    }

    // Validate user's organization (for ORG_ADMIN only)
    if (role.includes('ORG_ADMIN')) {
      const userOrgId = await getUserOrganizationIdById(userId);
      if (userOrgId !== organizationId) {
        console.error(`Access denied: User organizationId ${userOrgId} does not match requested organizationId ${organizationId}`);
        return res.status(403).json({ error: 'You can only create employees for your own organization' });
      }
    }

    // Validate inputs
    if (!phoneNumber || !idNumber || !firstName || !lastName || !grossSalary) {
      console.error('Missing required fields', { phoneNumber, idNumber, firstName, lastName, grossSalary });
      return res.status(400).json({ error: 'phoneNumber, idNumber, firstName, lastName, and grossSalary are required' });
    }
    if (grossSalary <= 0) {
      console.error(`Invalid grossSalary: ${grossSalary}`);
      return res.status(400).json({ error: 'Gross salary must be a positive number' });
    }

    // Check for duplicate phoneNumber or idNumber
    const existingEmployee = await prisma.employee.findFirst({
      where: { OR: [{ phoneNumber }, { idNumber }], tenantId },
      select: { id: true, phoneNumber: true, idNumber: true },
    });
    if (existingEmployee) {
      console.error(`Employee already exists: phoneNumber ${phoneNumber} or idNumber ${idNumber}`);
      return res.status(400).json({ error: 'Phone number or ID number already in use' });
    }

    // Create the employee
    const employee = await prisma.employee.create({
      data: {
        tenantId,
        organizationId,
        phoneNumber,
        idNumber,
        firstName,
        lastName,
        grossSalary: parseFloat(grossSalary),
      },
      select: {
        id: true,
        tenantId: true,
        organizationId: true,
        phoneNumber: true,
        idNumber: true,
        firstName: true,
        lastName: true,
        grossSalary: true,
        createdAt: true,
      },
    });

    // Log the action in audit logs
    await prisma.auditLog.create({
      data: {
        tenant: { connect: { id: tenantId } },
        user: { connect: { id: userId } },
        action: 'CREATE_EMPLOYEE',
        resource: 'Employee',
        details: JSON.stringify({
          employeeId: employee.id,
          phoneNumber,
          idNumber,
          firstName,
          lastName,
          grossSalary,
        }),
      },
    });

    // Send SMS to employee
    const welcomeMessage = `Welcome to ${organization.name}, ${firstName}! Your employee profile has been created. Contact HR for account setup.`;
    await sendSMS(tenantId, phoneNumber, welcomeMessage);
    console.log(`SMS sent to ${phoneNumber}: ${welcomeMessage}`);

    console.log(`Employee created: employeeId ${employee.id}`);
    return res.status(201).json({ message: 'Employee created successfully', employee });
  } catch (error) {
    console.error('Failed to create employee:', error.message);
    return res.status(500).json({ error: 'Failed to create employee' });
  }
};







const getEmployeeUsers = async (req, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID is required' });
    }

    // parse pagination params
    const page  = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, parseInt(req.query.limit, 10) || 10);

    // total count for server‐side pagination
    const total = await prisma.employee.count({
      where: { tenantId }
    });

    // fetch a page of employees
    const employees = await prisma.employee.findMany({
      where: { tenantId },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        organization: { select: { id: true, name: true } },
        tenant:       { select: { name: true } },
        user: {
          select: {
            id: true,
            email: true,
            phoneNumber: true,
            firstName: true,
            lastName: true,
            createdAt: true,
            loans: {
              select: {
                id: true,
                amount: true,
                interestRate: true,
                status: true,
                createdAt: true,
                dueDate: true,
              },
              orderBy: { createdAt: 'desc' }
            }
          }
        }
      }
    });

    // now sanitize into exactly the shape your DataGrid columns expect
    const data = employees.map(emp => ({
      userId:           emp.user?.id,
      firstName:        emp.user?.firstName  || emp.firstName,
      lastName:         emp.user?.lastName   || emp.lastName,
      email:            emp.user?.email      || '',
      phoneNumber:      emp.phoneNumber,
      organizationName: emp.organization.name,
      tenantName:       emp.tenant.name,
      loans:            emp.user?.loans      || [],
      createdAt:        emp.user?.createdAt  || emp.createdAt,
    }));

    return res.json({ data, total });
  } catch (error) {
    console.error('Error fetching employee-user overview:', error);
    return res.status(500).json({ message: 'Failed to fetch data' });
  }
};




async function searchEmployeeByName(req, res) {
  try {
    const tenantId = req.user?.tenantId;
    const { name, organizationId } = req.query;

    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID is required.' });
    }
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Query parameter `name` is required.' });
    }

    const where = {
      tenantId,
      OR: [
        { firstName: { contains: name.trim(), mode: 'insensitive' } },
        { lastName:  { contains: name.trim(), mode: 'insensitive' } },
      ],
    };
    if (organizationId) {
      where.organizationId = parseInt(organizationId, 10);
    }

    const employees = await prisma.employee.findMany({
      where,
      include: {
        organization: { select: { id: true, name: true } },
        user:         { select: { id: true, firstName: true, lastName: true, phoneNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json({ data: employees });
  } catch (err) {
    console.error('Error in searchEmployeeByName:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
}


async function searchEmployeeByPhone(req, res) {
  try {
    const tenantId = req.user?.tenantId;
    const { phone, organizationId } = req.query;

    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID is required.' });
    }
    if (!phone || !phone.trim()) {
      return res.status(400).json({ message: 'Query parameter `phone` is required.' });
    }

    // strip non-digits
    const normalized = phone.trim().replace(/\D/g, '');

    const where = {
      tenantId,
      phoneNumber: { contains: normalized, mode: 'insensitive' },
    };
    if (organizationId) {
      where.organizationId = parseInt(organizationId, 10);
    }

    const employees = await prisma.employee.findMany({
      where,
      include: {
        organization: { select: { id: true, name: true } },
        user:         { select: { id: true, firstName: true, lastName: true, phoneNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json({ data: employees });
  } catch (err) {
    console.error('Error in searchEmployeeByPhone:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
}






const updateEmployee = async (req, res) => {
  // const { employeeId } = req.params;
  // const { phoneNumber, idNumber, firstName, lastName, grossSalary, jobId, secondaryPhoneNumber } = req.body;

  // try {
  //   const employee = await prisma.employee.findUnique({
  //     where: { id: parseInt(employeeId) },
  //     include: { user: true },
  //   });
  //   if (!employee) {
  //     console.error(`Employee not found: employeeId ${employeeId}`);
  //     return res.status(404).json({ error: 'Employee not found' });
  //   }

  //   // Tenant scoping
  //   if (employee.tenantId !== req.user.tenantId) {
  //     console.error(`Access denied: User tenantId ${req.user.tenantId} does not match employee tenantId ${employee.tenantId}`);
  //     return res.status(403).json({ error: 'You can only update employees in your tenant' });
  //   }

  //   // Borrower organization scoping for ORG_ADMIN
  //   if (req.user.role.includes('ORG_ADMIN') && employee.organizationId !== req.user.organizationId) {
  //     console.error(`Access denied: User organizationId ${req.user.organizationId} does not match employee organizationId ${employee.organizationId}`);
  //     return res.status(403).json({ error: 'You can only update employees in your borrower organization' });
  //   }

  //   // Self-specific scoping for EMPLOYEE
  //   if (req.user.role.includes('EMPLOYEE') && employee.user?.id !== req.user.id) {
  //     console.error(`Access denied: User ${req.user.id} cannot update employee ${employeeId}`);
  //     return res.status(403).json({ error: 'You can only update your own employee record' });
  //   }

  //   // Validate inputs
  //   if (grossSalary !== undefined && grossSalary <= 0) {
  //     console.error(`Invalid grossSalary: ${grossSalary}`);
  //     return res.status(400).json({ error: 'Gross salary must be a positive number' });
  //   }
  //   if (phoneNumber) {
  //     const existingPhone = await prisma.employee.findFirst({
  //       where: { phoneNumber, NOT: { id: parseInt(employeeId) } },
  //     });
  //     if (existingPhone) {
  //       console.error(`Phone number already in use: ${phoneNumber}`);
  //       return res.status(400).json({ error: 'Phone number already in use' });
  //     }
  //   }
  //   if (idNumber) {
  //     const existingId = await prisma.employee.findFirst({
  //       where: { idNumber, NOT: { id: parseInt(employeeId) } },
  //     });
  //     if (existingId) {
  //       console.error(`ID number already in use: ${idNumber}`);
  //       return res.status(400).json({ error: 'ID number already in use' });
  //     }
  //   }

  //   const updateData = {};
  //   if (phoneNumber) updateData.phoneNumber = phoneNumber;
  //   if (idNumber) updateData.idNumber = idNumber;
  //   if (firstName) updateData.firstName = firstName;
  //   if (lastName) updateData.lastName = lastName;
  //   if (grossSalary !== undefined) updateData.grossSalary = grossSalary;
  //   if (jobId !== undefined) updateData.jobId = jobId;
  //   if (secondaryPhoneNumber !== undefined) updateData.secondaryPhoneNumber = secondaryPhoneNumber;

  //   const updatedEmployee = await prisma.employee.update({
  //     where: { id: parseInt(employeeId) },
  //     data: updateData,
  //   });

  //   // If employee has a linked User, update User to match firstName, lastName, and phoneNumber
  //   if (employee.user && (firstName || lastName || phoneNumber)) {
  //     const userUpdateData = {};
  //     if (firstName) userUpdateData.firstName = firstName;
  //     if (lastName) userUpdateData.lastName = lastName;
  //     if (phoneNumber) {
  //       const existingUserPhone = await prisma.user.findFirst({
  //         where: { phoneNumber, NOT: { id: employee.user.id } },
  //       });
  //       if (existingUserPhone) {
  //         console.error(`User phone number already in use: ${phoneNumber}`);
  //         return res.status(400).json({ error: 'User phone number already in use' });
  //       }
  //       userUpdateData.phoneNumber = phoneNumber;
  //     }

  //     if (Object.keys(userUpdateData).length > 0) {
  //       await prisma.user.update({
  //         where: { id: employee.user.id },
  //         data: userUpdateData,
  //       });
  //     }
  //   }

  //   await prisma.auditLog.create({
  //     data: {
  //       tenantId: employee.tenantId,
  //       userId: req.user.id,
  //       action: 'UPDATE_EMPLOYEE',
  //       resource: 'Employee',
  //       details: { employeeId, changes: updateData },
  //     },
  //   });

  //   console.log(`Employee updated: employeeId ${employeeId}`);
  //   res.status(200).json({ message: 'Employee updated successfully', employee: updatedEmployee });
  // } catch (error) {
  //   console.error('Failed to update employee:', error.message);
  //   res.status(500).json({ error: 'Failed to update employee' });
  // }
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
  getEmployeeUsers,
  updateEmployee,
  deleteEmployee,
   searchEmployeeByName,
  searchEmployeeByPhone,
};