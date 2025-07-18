import { PrismaClient, Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/verifyToken';
import { getUserOrganizationIdById } from '../userManagement/userManagement';
import { sendSMS } from '../sms/sms';
import { APIResponse, APIResponseEmployee, APIResponseGetUser, Employee, EmployeeInput, Employees, EmployeeWithExtras, PaginatedResponse } from '../../types/employee';
import { UserDetailsWithRelations} from '../../types/user';



const prisma = new PrismaClient();






const createEmployee = async (req: AuthenticatedRequest, res: Response<APIResponse<Employee>>): Promise<void> => {
  const { organizationId, phoneNumber, idNumber, grossSalary, firstName, lastName, jobId, secondaryPhoneNumber } = req.body as Employee;
  const { tenantId, role, id: userId } = req.user!;

  try {
    // Role validation
    if (!role.includes('ORG_ADMIN') && !role.includes('ADMIN')) {
      console.error(`Access denied: User ${userId} lacks required role (ORG_ADMIN or ADMIN)`);
      res.status(403).json({ error: 'Access denied. Only ORG_ADMIN or ADMIN can create employees.' });
      return;
    }

    // Tenant scoping
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true },
    });
    if (!tenant) {
      console.error(`Tenant not found: tenantId ${tenantId}`);
      res.status(404).json({ error: 'Tenant (Lender Organization) not found' });
      return;
    }

    // Check if organization exists
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, tenantId: true, name: true },
    });
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

    // Validate user's organization (for ORG_ADMIN only)
    if (role.includes('ORG_ADMIN')) {
      const userOrgId = await getUserOrganizationIdById(userId);
      if (userOrgId !== organizationId) {
        console.error(`Access denied: User organizationId ${userOrgId} does not match requested organizationId ${organizationId}`);
        res.status(403).json({ error: 'You can only create employees for your own organization' });
        return;
      }
    }

    // Validate inputs
    if (!phoneNumber || !idNumber || !firstName || !lastName || !grossSalary) {
      console.error('Missing required fields', { phoneNumber, idNumber, firstName, lastName, grossSalary });
      res.status(400).json({ error: 'phoneNumber, idNumber, firstName, lastName, and grossSalary are required' });
      return;
    }
    if (grossSalary <= 0) {
      console.error(`Invalid grossSalary: ${grossSalary}`);
      res.status(400).json({ error: 'Gross salary must be a positive number' });
      return;
    }

    // Check for duplicate phoneNumber or idNumber
    const existingEmployee = await prisma.employee.findFirst({
      where: { OR: [{ phoneNumber }, { idNumber }], tenantId },
      select: { id: true, phoneNumber: true, idNumber: true },
    });
    if (existingEmployee) {
      console.error(`Employee already exists: phoneNumber ${phoneNumber} or idNumber ${idNumber}`);
      res.status(400).json({ error: 'Phone number or ID number already in use' });
      return;
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
        grossSalary: parseFloat(grossSalary.toString()),
        jobId, // Include optional jobId
        secondaryPhoneNumber, // Include optional secondaryPhoneNumber
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
        jobId: true, // Include in select
        secondaryPhoneNumber: true, // Include in select
        createdAt: true,
        updatedAt: true, // Include in select
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
          jobId,
          secondaryPhoneNumber,
        }),
      },
    });

    // Send SMS to employee
    const welcomeMessage = `Welcome to ${organization.name}, ${firstName}! Your employee profile has been created. Contact HR for account setup.`;
    await sendSMS(tenantId, phoneNumber, welcomeMessage);
    console.log(`SMS sent to ${phoneNumber}: ${welcomeMessage}`);

    console.log(`Employee created: employeeId ${employee.id}`);
    res.status(201).json({ message: 'Employee created successfully', employee });
  } 
  catch (error: any) {
  console.error('Failed to create employee:', error);

  if (error.code === 'P2002') {
    const fields = error.meta?.target?.join(', ') || 'a unique field';
    res.status(400).json({ error: `An employee with the same ${fields} already exists.` });
  } else {
    res.status(500).json({ error: 'Failed to create employee' });
  }
}

};


const getEmployeeUsers = async (
  req: AuthenticatedRequest,
  res: Response<APIResponseEmployee<PaginatedResponse<EmployeeWithExtras>>>
): Promise<void> => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) {
    res.status(400).json({ success: false, message: 'Tenant ID is required', data: {total:0, data:[] } });
    return;
  }

  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.max(1, parseInt(req.query.limit as string, 10) || 10);

  const total = await prisma.employee.count({ where: { tenantId } });

  const employees = await prisma.employee.findMany({
    where: { tenantId },
    skip: (page - 1) * limit,
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: {
      organization: { select: { id: true, name: true } },
      tenant: { select: { name: true } },
      user: {
        select: {
          id: true,
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
          },
        },
      },
    },
  });

  res.json({
    success: true,
    data: {
      total,
      data:employees,
    },
  });
};



const getEmployeesWithoutUserProfiles = async (
  req: AuthenticatedRequest,
  res: Response<APIResponseEmployee<PaginatedResponse<Employees>>>
): Promise<void> => {
  const tenantId = req.user?.tenantId;

  if (!tenantId) {
    res.status(400).json({
      success: false,
      message: 'Tenant ID is required',
      data: { total: 0, data: [] },
    });
    return;
  }

  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.max(1, parseInt(req.query.limit as string, 10) || 10);

  const total = await prisma.employee.count({
    where: {
      tenantId,
      user: null,
    },
  });

  const employees = await prisma.employee.findMany({
    where: {
      tenantId,
      user: null,
    },
    skip: (page - 1) * limit,
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: {
      organization: { select: { id: true, name: true } },
      tenant: { select: { name: true } },
      user: true, // always null here
    },
  });

  res.json({
    success: true,
    data: {
      total,
      data: employees,
    },
  });
};



// Search Employee by Name
const searchEmployeeByName = async (req: AuthenticatedRequest, res: Response<APIResponse<Employee & { organization: { id: number; name: string }; user: { id: number; firstName: string; lastName: string; phoneNumber: string } | null }>>): Promise<void> => {
  try {
    const tenantId = req.user?.tenantId;
    const { name, organizationId } = req.query as { name?: string; organizationId?: string };

    if (!tenantId) {
      res.status(400).json({ message: 'Tenant ID is required.' });
      return;
    }
    if (!name || !name.trim()) {
      res.status(400).json({ message: 'Query parameter `name` is required.' });
      return;
    }

    const where: any = {
      tenantId,
      OR: [
        { firstName: { contains: name.trim(), mode: 'insensitive' } },
        { lastName: { contains: name.trim(), mode: 'insensitive' } },
      ],
    };
    if (organizationId) {
      where.organizationId = parseInt(organizationId, 10);
    }

    const employees = await prisma.employee.findMany({
      where,
      include: {
        organization: { select: { id: true, name: true } },
        user: { select: { id: true, firstName: true, lastName: true, phoneNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json({ data: employees });
  } catch (error: any) {
    console.error('Error in searchEmployeeByName:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Search Employee by Phone
const searchEmployeeByPhone = async (req: AuthenticatedRequest, res: Response<APIResponse<Employee & { organization: { id: number; name: string }; user: { id: number; firstName: string; lastName: string; phoneNumber: string } | null }>>): Promise<void> => {
  try {
    const tenantId = req.user?.tenantId;
    const { phone, organizationId } = req.query as { phone?: string; organizationId?: string };

    if (!tenantId) {
      res.status(400).json({ message: 'Tenant ID is required.' });
      return;
    }
    if (!phone || !phone.trim()) {
      res.status(400).json({ message: 'Query parameter `phone` is required.' });
      return;
    }

    const normalized = phone.trim().replace(/\D/g, '');

    const where: any = {
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
        user: { select: { id: true, firstName: true, lastName: true, phoneNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json({ data: employees });
  } catch (error: any) {
    console.error('Error in searchEmployeeByPhone:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};




const updateEmployee = async (
  req: AuthenticatedRequest & { params: { userId: number} },
  res: Response<APIResponseEmployee<EmployeeInput>>
): Promise<void> => {
  //const { id:userId } = req.user!;
   const { tenantId } = req.user!;
   const {role} = req.user!;
   const {id : loggedInUserId} = req.user!;
   //const {organizationId} = req.user!;
  const {
    phoneNumber,
    idNumber,
    firstName,
    lastName,
    grossSalary,
    jobId,
    secondaryPhoneNumber,
  } = req.body as Partial<EmployeeInput>;
  const userId = req.params.userId!;
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { employee: true , organization: true, tenant: true },
    });

    if (!user || !user.employee) {
      res.status(404).json({ success: false, message: 'User or employee not found', data: null });
      return;
    }

    const employee = user.employee;

    if (employee.tenantId !== tenantId) {
    res.status(403).json({ success: false, message: 'Unauthorized tenant access', data: null });
      return;
    }

    if (
      role.includes('ORG_ADMIN') &&
      employee.organizationId !== user.organizationId
    ) {
     res.status(403).json({ success: false, message: 'Unauthorized organization access', data: null });
     return;
    }

    if (role.includes('EMPLOYEE') && user.id !== loggedInUserId) {
      res.status(403).json({ success: false, message: 'Employees can only update their own profile', data: null });
      return;
    }

    if (grossSalary && grossSalary <= 0) {
     res.status(400).json({ success: false, message: 'Gross salary must be positive', data: null });
     return;
    }

    if (phoneNumber) {
      const existingPhone = await prisma.employee.findFirst({
        where: { phoneNumber, NOT: { id: employee.id } },
      });
      if (existingPhone) {
        res.status(400).json({ success: false, message: 'Phone number already in use', data: null });
        return;
      }
    }

    if (idNumber) {
      const existingId = await prisma.employee.findFirst({
        where: { idNumber, NOT: { id: employee.id } },
      });
      if (existingId) {
        res.status(400).json({ success: false, message: 'ID number already in use', data: null });
        return;
      }
    }

    const updateData: Partial<EmployeeInput> = {};
    if (phoneNumber) updateData.phoneNumber = phoneNumber;
    if (idNumber) updateData.idNumber = idNumber;
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (grossSalary) updateData.grossSalary = grossSalary;
    if (jobId !== undefined) updateData.jobId = jobId;
    if( secondaryPhoneNumber !== undefined) updateData.secondaryPhoneNumber = secondaryPhoneNumber;
   
  
    if (secondaryPhoneNumber !== undefined) updateData.secondaryPhoneNumber = secondaryPhoneNumber;

    const updatedEmployee = await prisma.employee.update({
      where: { id: employee.id },
      data: updateData,
    });

    // Update user fields
    const userUpdateData: Prisma.UserUpdateInput = {};
   

    if (firstName) userUpdateData.firstName = firstName;
    if (lastName) userUpdateData.lastName = lastName;
 
    if (phoneNumber) {
      const existingUser = await prisma.user.findFirst({
        where: { phoneNumber, NOT: { id: user.id } },
      });
      if (existingUser) {
       res.status(400).json({ success: false, message: 'User phone number already in use', data: null });
       return
      }
      userUpdateData.phoneNumber = phoneNumber;
    }

    if (Object.keys(userUpdateData).length > 0) {
      await prisma.user.update({
        where: { id: user.id },
        data: userUpdateData,
      });
    }

    await prisma.auditLog.create({
      data: {
        tenantId: employee.tenantId,
        userId: userId,
        action: 'UPDATE_EMPLOYEE',
        resource: 'Employee',
        details: JSON.stringify({ userId, changes: updateData }),
      },
    });

    res.status(200).json({
      success: true,
      message: 'Employee updated successfully',
      data: updatedEmployee,
    });
  } catch (error: any) {
    console.error('Failed to update employee:', error.message);
    res.status(500).json({ success: false, message: 'Internal server error', data: null });
  }
};





const deleteEmployee = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const { tenantId, role } = req.user!;
  const employeeId = parseInt(req.params.id);

  try {
    // 🔐 Role-based access check
    if (!role.includes('ADMIN') && !role.includes('ORG_ADMIN')) {
     res.status(403).json({ error: 'Access denied. Only ADMIN or ORG_ADMIN can delete employees.' });
      return;
    }

    // 🔍 Find employee
    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
      include: { user: true },
    });

    if (!employee) {
     res.status(404).json({ error: 'Employee not found or does not belong to this tenant.' });
      return;
    }

    // 🧹 Delete associated user if exists
    if (employee.user) {
      await prisma.user.delete({
        where: { id: employee.user.id },
      });
    }

    // 🗑️ Delete the employee
    await prisma.employee.delete({
      where: { id: employeeId },
    });

    res.status(200).json({ message: 'Employee and associated user deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting employee:', error.message);
    res.status(500).json({ error: 'Failed to delete employee' });
  }
};
;

// Get User Details by ID





const getEmployeeDetails = async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.params;

  try {
    const user = await prisma.user.findUnique({
      where: { id: Number(userId) },
      include: {
        employee: {
          include: {
            tenant: true,
            organization: true
          }
        },
        loans: {
          include: { organization: true },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!user || !user.employee) {
      res.status(404).json({ message: 'User or associated employee not found.' });
      return;
    }

    const loans = user.loans;

    const oneYearAgo = new Date();
    oneYearAgo.setMonth(oneYearAgo.getMonth() - 12);
    const recentLoans = loans.filter(loan => loan.createdAt >= oneYearAgo);

    const totalAmount = loans.reduce((sum, loan) => sum + loan.amount, 0);
    const averageLoanAmount = loans.length > 0 ? totalAmount / loans.length : 0;

    res.json({
      employee: {
        id: user.employee.id,
        firstName: user.employee.firstName,
        lastName: user.employee.lastName,
        phoneNumber: user.employee.phoneNumber,
        idNumber: user.employee.idNumber,
        grossSalary: user.employee.grossSalary,
        organization: user.employee.organization.name,
        tenant: user.employee.tenant.name,
      },
      loanStats: {
        totalLoansTaken: loans.length,
        loansInLast12Months: recentLoans.length,
        averageLoanAmount: Number(averageLoanAmount.toFixed(2)),
      },
      allLoans: loans.map(loan => ({
        id: loan.id,
        amount: loan.amount,
        interestRate: loan.interestRate,
        duration: loan.duration,
        status: loan.status,
        createdAt: loan.createdAt,
        organization: loan.organization.name,
      }))
    });

  } catch (error) {
    console.error('Error fetching employee details:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
};



export {
  createEmployee,
  getEmployeeUsers,
  updateEmployee,
  deleteEmployee,
  searchEmployeeByName,
  searchEmployeeByPhone,
getEmployeeDetails,
  getEmployeesWithoutUserProfiles
};