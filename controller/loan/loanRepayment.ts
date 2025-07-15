// import { Request, Response } from 'express';
// import {  LoanStatus, PrismaClient } from '@prisma/client';

// import { AuthenticatedRequest } from '../../middleware/verifyToken';
// import { ConsolidatedRepayment } from '../../types/loans/loansPayments';
// import { Loan } from '../../types/loans/loan';




// // Initialize Prisma client
// const prisma = new PrismaClient();




// export  interface ApiResponse<T> {

//   success: boolean;
//   message: string;
//   data: [] | null;
//   error?: string | null;

// }



// // Interface for the request body
// interface RepaymentRequestBody {
//   amount: number;
//   organizationId: number;
// }



// interface LoanSubset extends Loan {
//   organization: { id: number };
//   user: {
//     id: number;
//     firstName: string;
//     lastName: string;
//     phoneNumber: string;
//   };
//   id: number;
//   userId: number;
//   organizationId: number;
//   tenantId: number;
//   status: LoanStatus;
//   createdAt: Date;
//   totalRepayable: number;
// }

// // Create repayment route handler


// // Create repayment route handler
// const createRepayment = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
//   const { amount, organizationId } = req.body;
//   const { id, tenantId, role, firstName, lastName, organizationId: userOrganizationId } = req.user!;

//   // Validate user and required fields
//   if (id === null || tenantId === null || role === null || firstName === null || lastName === null) {
//     res.status(401).json({
//       message: 'Unauthorized: User not authenticated or missing required fields'
//     });
//   }

//   // Restrict to ORG_ADMIN or ADMIN roles
//   if (!role.includes('ORG_ADMIN') && !role.includes('ADMIN')) {
//     res.status(403).json({ message: 'Only ORG_ADMIN or ADMIN can initiate repayments' });
//     return;
//   }

//   // Validate request body
//   if (!amount || amount <= 0 || !organizationId) {
//     res.status(400).json({ message: 'Valid amount and organizationId are required' });
//     return;
//   }

//   try {
//     // For ORG_ADMIN, verify they belong to the organization
//     if (role.includes('ORG_ADMIN')) {
//       if (!userOrganizationId) {
//         res.status(403).json({ message: 'ORG_ADMIN must have an employeeId' });
//       }
//       console.time('employeeQuery');
//       const employee = await prisma.employee.findFirst({
//         where: { id: userOrganizationId, tenantId: tenantId },
//         select: { organizationId: true },
//       });
//       console.timeEnd('employeeQuery');

//       if (!employee || employee.organizationId !== organizationId) {
//         res.status(403).json({ message: 'Unauthorized to initiate repayment for this organization' });
//       }
//     } else if (role.includes('ADMIN') && tenantId !== (await prisma.organization.findUnique({ where: { id: organizationId } }))?.tenantId) {
//       res.status(403).json({ message: 'Unauthorized to initiate repayment for this organization' });
//     }

//     // Fetch all non-repaid loans for employees in the organization
//     console.time('loansQuery');
   
// const loans: LoanSubset[] = await prisma.loan.findMany({
//   where: {
//     organizationId,
//     tenantId: tenantId,
//     status: { not: 'REPAID' },
//   },
//   select: {
//     organization: { select: { id: true } },
//     user: {
//       select: {
//         id: true,
//         firstName: true,
//         lastName: true,
//         phoneNumber: true,
//       },
//     },
//   },
// });

//     console.timeEnd('loansQuery');

//     if (loans.length === 0) {
//       res.status(400).json({ message: 'No outstanding loans found for this organization' });
//     }

//     // Calculate total repayable amount
//     const totalRepayable: number = loans.reduce((sum, loan) => sum + loan.totalRepayable, 0);
//     if (amount < totalRepayable) {
//       res.status(400).json({
//         message: `Repayment amount (${amount}) is less than total repayable (${totalRepayable}) for ${loans.length} loans`,
//       });
//     }

//     // Create repayment and update loans in a transaction
//     console.time('repaymentTransaction');
//     const repayment = await prisma.$transaction(async (prisma) => {
//       const newRepayment: ConsolidatedRepayment = await prisma.consolidatedRepayment.create({
//         data: {
//           organizationId: organizationId,
//           tenantId: tenantId,
//           amount: amount,
//           totalAmount: totalRepayable,
//           paidAt: new Date(),
//           status: 'REPAID',
//         },
//       });

//       await prisma.loan.updateMany({
//         where: { id: { in: loans.map(loan => loan.id) } },
//         data: {
//           consolidatedRepaymentId: newRepayment.id,
//           status: 'REPAID',
//         },
//       });

//       return newRepayment;
//     });
//     console.timeEnd('repaymentTransaction');

//     // Log the repayment action
   




//     // Log the repayment action
//     console.time('auditLogQuery');
//     await prisma.auditLog.create({
//       data: {
//         tenantId: tenantId,
//         userId: id,
//         action: 'CREATE',
//         resource: 'REPAYMENT',
//         details: {
//           message: `User ${firstName} ${lastName} initiated repayment of ${amount} for ${loans.length} loans in organization ${organizationId}`,
//           repaymentId: repayment.id,
//           loanIds: loans.map(loan => loan.id),
//           amount,
//         },
//       },
//     });
//     console.timeEnd('auditLogQuery');

//      res.status(201).json({
//       message: 'Repayment processed for organization loans',
//       repayment,
//       loanCount: loans.length,
//       totalRepayable,
//     });
//   } catch (error: any) {
//     console.error('Error creating repayment:', error);
//   res.status(500).json({ message: 'Internal server error', error: error.message });
//   } finally {
//     await prisma.$disconnect();
//   }
// };

// export default createRepayment;



