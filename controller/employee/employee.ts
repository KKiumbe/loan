import { PrismaClient, Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../middleware/verifyToken';
import { getUserOrganizationIdById } from '../userManagement/userManagement';
import { sendSMS } from '../sms/sms';
import { APIResponse, APIResponseEmployee, APIResponseGetUser, Employee, EmployeeInput, Employees, EmployeeWithExtras, PaginatedResponse } from '../../types/employee';
import { UserDetailsWithRelations} from '../../types/user';




const prisma = new PrismaClient();

interface SearchResult {
  total: number;
  data: (Employee & { organization: { id: number; name: string; }; user: { id: number; firstName: string; lastName: string; phoneNumber: string; } | null; })[];
}

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
        updatedAt: new Date(), // Explicitly set updatedAt
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
        Tenant: { connect: { id: tenantId } },
        User: { connect: { id: userId } },
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
    const welcomeMessage = `Welcome to ${organization.name}, ${firstName}! Your  profile has been created. Contact support for account setup.`;
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
      Organization: { select: { id: true, name: true } },
      Tenant: { select: { name: true } },
      User: {
        select: {
          id: true,
          phoneNumber: true,
          firstName: true,
          lastName: true,
          createdAt: true,
          Loan: {
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



export const getEmployeeUsersByOrgID = async (
  req: AuthenticatedRequest,
  res: Response<APIResponseEmployee<PaginatedResponse<EmployeeWithExtras>>>
): Promise<void> => {
  const startTime = Date.now();

  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      res.status(400).json({ success: false, message: 'Tenant ID is required', data: { total: 0, data: [] } });
      return;
    }

    const { orgId } = req.body; // Expecting orgId from request body
    if (!orgId || isNaN(Number(orgId))) {
      res.status(400).json({ success: false, message: 'Valid Organization ID is required', data: { total: 0, data: [] } });
      return;
    }

    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.max(1, parseInt(req.query.limit as string, 10) || 10);

    // Validate organization exists and belongs to tenant
    const organization = await prisma.organization.findUnique({
      where: { id: Number(orgId), tenantId },
    });
    if (!organization) {
      res.status(404).json({ success: false, message: 'Organization not found', data: { total: 0, data: [] } });
      return;
    }

    // Count total employees for the specific organization
    const total = await prisma.employee.count({
      where: { tenantId, organizationId: Number(orgId) },
    });

    // Fetch employees for the specific organization
    const employees = await prisma.employee.findMany({
      where: {
        tenantId,
        organizationId: Number(orgId),
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        Organization: { select: { id: true, name: true } },
        Tenant: { select: { name: true } },
        User: {
          select: {
            id: true,
            phoneNumber: true,
            firstName: true,
            lastName: true,
            createdAt: true,
            Loan: {
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
        data: employees,
      },
    });

    console.log(`✅ Employee list retrieved in ${Date.now() - startTime}ms`);
  } catch (err) {
    console.error('❌ Error retrieving employees:', err instanceof Error ? err.message : String(err));
    res.status(500).json({
      success: false,
      message: err instanceof Error ? err.message : 'Failed to retrieve employees',
      data: { total: 0, data: [] },
    });
  } finally {
    await prisma.$disconnect();
  }
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
      User: null,
    },
  });

  const employees = await prisma.employee.findMany({
    where: {
      tenantId,
      User: null,
    },
    skip: (page - 1) * limit,
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: {
      Organization: { select: { id: true, name: true } },
      Tenant: { select: { name: true } },
      User: true, // always null here
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
const searchEmployeeByName = async (
  req: AuthenticatedRequest,
  res: Response<APIResponseEmployee<PaginatedResponse<EmployeeWithExtras>>>
): Promise<void> => {
  try {
    const tenantId = req.user?.tenantId;
    const { name, organizationId } = req.query as { name?: string; organizationId?: string };

    if (!tenantId) {
      res.status(400).json({
        message: 'Tenant ID is required.',
        success: false,
        data: { total: 0, data: [] },
      });
      return;
    }

    if (!name && !organizationId) {
      res.status(400).json({
        message: 'At least one of `name` or `organizationId` is required.',
        success: false,
        data: { total: 0, data: [] },
      });
      return;
    }

    const where: Prisma.EmployeeWhereInput = { tenantId };

    // add name filter if present
    if (name?.trim()) {
      const trimmedName = name.trim();
      where.User = {
        OR: [
          { firstName: { contains: trimmedName, mode: 'insensitive' } },
          { lastName: { contains: trimmedName, mode: 'insensitive' } },
        ],
      };
    }

    // add organization filter if present
    if (organizationId) {
      where.organizationId = parseInt(organizationId, 10);
    }

    const total = await prisma.employee.count({ where });

    const employees = await prisma.employee.findMany({
      where,
      include: {
        Organization: { select: { id: true, name: true } },
        Tenant: { select: { name: true } },
        User: {
          select: {
            id: true,
            phoneNumber: true,
            firstName: true,
            lastName: true,
            createdAt: true,
            Loan: {
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
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json({
      success: true,
      data: { total, data: employees },
    });
  } catch (error: any) {
    console.error('Error in searchEmployeeByName:', error);
    res.status(500).json({
      message: 'Internal server error',
      success: false,
      data: { total: 0, data: [] },
    });
  }
};


const getEmployeesByOrganization = async (
  req: AuthenticatedRequest,
  res: Response<APIResponseEmployee<PaginatedResponse<EmployeeWithExtras>>>
): Promise<void> => {
  try {
    const tenantId = req.user?.tenantId;
    const { organizationId } = req.query as { organizationId?: string };

    if (!tenantId) {
      res.status(400).json({
        message: 'Tenant ID is required.',
        success: false,
        data: { total: 0, data: [] },
      });
      return;
    }

    if (!organizationId) {
      res.status(400).json({
        message: '`organizationId` is required.',
        success: false,
        data: { total: 0, data: [] },
      });
      return;
    }

    const where: Prisma.EmployeeWhereInput = {
      tenantId,
      organizationId: parseInt(organizationId, 10),
    };

    const total = await prisma.employee.count({ where });

    const employees = await prisma.employee.findMany({
      where,
      include: {
        Organization: { select: { id: true, name: true } },
        Tenant: { select: { name: true } },
        User: {
          select: {
            id: true,
            phoneNumber: true,
            firstName: true,
            lastName: true,
            createdAt: true,
            Loan: {
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
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json({
      success: true,
      data: { total, data: employees },
    });
  } catch (error: any) {
    console.error('Error in getEmployeesByOrganization:', error);
    res.status(500).json({
      message: 'Internal server error',
      success: false,
      data: { total: 0, data: [] },
    });
  }
};

// Search Employee by Phone


const searchEmployeeByPhone = async (
  req: AuthenticatedRequest,
  res: Response<APIResponseEmployee<PaginatedResponse<EmployeeWithExtras>>>
): Promise<void> => {
  try {
    const tenantId = req.user?.tenantId;
    const { phone, organizationId } = req.query as { phone?: string; organizationId?: string };

    if (!tenantId) {
      res.status(400).json({
        message: 'Tenant ID is required.',
        success: false,
        data: { total: 0, data: [] },
      });
      return;
    }

    if (!phone && !organizationId) {
      res.status(400).json({
        message: 'At least one of `phone` or `organizationId` is required.',
        success: false,
        data: { total: 0, data: [] },
      });
      return;
    }

    const where: Prisma.EmployeeWhereInput = { tenantId };

    // add phone filter if present
    if (phone?.trim()) {
      const trimmedPhone = phone.trim();
      where.OR = [
        { phoneNumber: { contains: trimmedPhone, mode: 'insensitive' } },
        { secondaryPhoneNumber: { contains: trimmedPhone, mode: 'insensitive' } },
      ];
    }

    // add organization filter if present
    if (organizationId) {
      where.organizationId = parseInt(organizationId, 10);
    }

    const total = await prisma.employee.count({ where });

    const employees = await prisma.employee.findMany({
      where,
      include: {
        Organization: { select: { id: true, name: true } },
        Tenant: { select: { name: true } },
        User: {
          select: {
            id: true,
            phoneNumber: true,
            firstName: true,
            lastName: true,
            createdAt: true,
            Loan: {
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
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json({
      success: true,
      data: { total, data: employees },
    });
  } catch (error: any) {
    console.error('Error in searchEmployeeByPhone:', error);
    res.status(500).json({
      message: 'Internal server error',
      success: false,
      data: { total: 0, data: [] },
    });
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
      include: { Employee: true , Organization: true, Tenant: true },
    });

    if (!user || !user.Employee) {
      res.status(404).json({ success: false, message: 'User or employee not found', data: null });
      return;
    }

    const employee = user.Employee;

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






const getEmployeeDetails = async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.params;

  try {
    const user = await prisma.user.findUnique({
      where: { id: Number(userId) },
      include: {
        Employee: {
          include: {
            Tenant: true,
            Organization: true
          }
        },
        Loan: {
          include: { Organization: true },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!user || !user.Employee) {
      res.status(404).json({ message: 'User or associated employee not found.' });
      return;
    }

    const loans = user.Loan;

    const oneYearAgo = new Date();
    oneYearAgo.setMonth(oneYearAgo.getMonth() - 12);
    const recentLoans = loans.filter(loan => loan.createdAt >= oneYearAgo);

    const totalAmount = loans.reduce((sum, loan) => sum + loan.amount, 0);
    const averageLoanAmount = loans.length > 0 ? totalAmount / loans.length : 0;

    res.json({
      employee: {
        id: user.Employee.id,
        firstName: user.Employee.firstName,
        lastName: user.Employee.lastName,
        phoneNumber: user.Employee.phoneNumber,
        idNumber: user.Employee.idNumber,
        grossSalary: user.Employee.grossSalary,
        organization: user.Employee.Organization.name,
        tenant: user.Employee.Tenant.name,
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
        organization: loan.Organization.name,
      }))
    });

  } catch (error) {
    console.error('Error fetching employee details:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
};



// Soft delete employee and associated user
const softDeleteEmployeeUser = async (
  req: AuthenticatedRequest ,
  res: Response
): Promise<void> => {
  try {
    const {  employeeId } = req.params;
    const { id: userId, tenantId } = req.user!;

    // Verify tenant exists
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      res.status(404).json({ error: 'Tenant (Lender Organization) not found' });
      return;
    }

    // Verify employee exists
    const employee = await prisma.employee.findFirst({
      where: { id: parseInt(employeeId), tenantId },
      include: { User: true },
    });
    if (!employee) {
      res.status(404).json({ error: 'Employee not found' });
      return;
    }

    // Check for dependent records
    const dependentLoans = await prisma.loan.count({ where: { userId: employee.User?.id } });
    const dependentRepayments = await prisma.consolidatedRepayment.count({
      where: { userId: employee.User?.id },
    });
    if (dependentLoans > 0 || dependentRepayments > 0) {
      res.status(400).json({
        error: 'Cannot delete employee with associated loans or repayments',
      });
      return;
    }

    // Soft delete: Update user status to DISABLED (Employee has no status field)
    if (employee.User) {
      await prisma.user.update({
        where: { id: employee.User.id },
        data: { status: 'DISABLED' },
      });
    }

    // Log the action
    await prisma.auditLog.create({
      data: {
        Tenant: { connect: { id: tenantId } },
        User: { connect: { id: userId } },
        action: 'DELETE_EMPLOYEE_USER',
        resource: 'Employee',
        details: {
          employeeId,
          userId: employee.User?.id || null,
          message: 'Employee and associated user soft deleted',
        },
      },
    });

    res.status(200).json({ message: 'Employee soft deleted successfully' });
  } catch (error) {
    console.error('Failed to soft delete Employee-User:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Hard delete employee and associated user

const hardDeleteEmployeeUser = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { tenantId } = req.user!;
    const { userId } = req.params;

    // Start a transaction
    await prisma.$transaction(async (tx) => {
      // 1. Find the user and associated employee
      const user = await tx.user.findFirst({
        where: { id: parseInt(userId), tenantId },
        include: { Employee: true },
      });

      if (!user || !user.Employee) {
        res.status(404).json({ success: false, message: 'Employee user not found' });
        return;
      }

      const employeeId = user.Employee.id;

      // 2. Delete related records that depend on the User
      // Delete ConsolidatedRepayment records
      await tx.consolidatedRepayment.deleteMany({
        where: { userId: parseInt(userId) },
      });

      // Delete AuditLog records
      await tx.auditLog.deleteMany({
        where: { userId: parseInt(userId) },
      });

      // 3. Delete PaymentConfirmation records associated with LoanPayouts for this User's Loans
      await tx.paymentConfirmation.deleteMany({
        where: {
          LoanPayout: {
            Loan: {
              userId: parseInt(userId),
            },
          },
        },
      });

      // 4. Delete LoanPayout records associated with Loans for this User
      await tx.loanPayout.deleteMany({
        where: {
          Loan: {
            userId: parseInt(userId),
          },
        },
      });

      // 5. Delete Loan records for this User
      await tx.loan.deleteMany({
        where: { userId: parseInt(userId) },
      });

      // 6. Delete Employee record
      await tx.employee.delete({
        where: { id: employeeId },
      });

      // 7. Delete User record
      await tx.user.delete({
        where: { id: parseInt(userId) },
      });
    });

    res.json({ success: true, message: 'Employee and linked user data deleted permanently' });
  } catch (error) {
    console.error('Error in hardDeleteEmployeeUser:', error);
    res.status(500).json({ success: false, message: 'Error deleting employee and user data' });
  }
};
export {
  createEmployee,
  getEmployeeUsers,
  updateEmployee,
 

  searchEmployeeByPhone,
  searchEmployeeByName,
getEmployeeDetails,
  getEmployeesWithoutUserProfiles,hardDeleteEmployeeUser,softDeleteEmployeeUser,getEmployeesByOrganization
};