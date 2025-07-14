import { LoanStatus, PayoutStatus } from "@prisma/client";

// src/types/loan.ts
// export type Loan = {
//   id: number;
//   amount: number;
//   interestRate: number;
//   status: LoanStatus;
//   createdAt: Date;
//   dueDate: Date;
// };



export  interface LoanDetails {
  dueDate: Date;
  totalRepayable: number;
}

export  interface Tenant {
  name: string;
}
// types/loan.ts


export class AutoApprovalResponse {
  loan: Loan = {} as Loan; // initialize with an empty object
  loanPayout: any
  disbursement: any
}


export  interface Employee {
  id: number;
  firstName: string;
  lastName: string;
  grossSalary: number;
  phoneNumber: string;
  organizationId?: number;
  organization: Organization | null;
}


export interface LoanbyId {
  id: number;
  userId: number;
  organizationId: number;
  tenantId: number;
  amount: number;
  interestRate: number;
  dueDate: Date;
  totalRepayable: number;
  status: LoanStatus;
  approvalCount: number;
  createdAt: Date;
  updatedAt: Date;
  disbursedAt: Date | null;
  firstApproverId: number | null;
  secondApproverId: number | null;
  thirdApproverId: number | null;
  mpesaTransactionId: string | null;
  mpesaStatus: string | null;
  originatorConversationID: string | null;
  duration: number;
  user: {
    id: number;
    firstName: string;
    lastName: string;
    phoneNumber: string;
  };
  organization: {
    id: number;
    name: string;
    approvalSteps: number;
  };
  consolidatedRepayment: {
    id: number;
    userId: number;
    organizationId: number;
    tenantId: number;
    amount: number;
    totalAmount: number | null;
    paidAt: Date | null;
    status: string | null;
    createdAt: Date;
    updatedAt: Date;
  } | null;
}

export  interface User {
  id: number;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email?: string | null;
}



export  interface Loan {
  id: number;
  userId: number;
  organizationId: number;
  tenantId: number;
  amount: number;
  interestRate: number;
  dueDate: Date;
  totalRepayable: number;
  status: LoanStatus;
  approvalCount: number;
  createdAt: Date;
  updatedAt: Date;
  disbursedAt: Date | null;
  firstApproverId: number | null;
  secondApproverId: number | null;
  thirdApproverId: number | null;
  mpesaTransactionId: string | null;
  mpesaStatus: string | null;
  originatorConversationID: string | null;
  duration: number;
  user?: User;
  organization: Organization;
  consolidatedRepayment: ConsolidatedRepayment | null;
  LoanPayout?: LoanPayout[];
}


export  interface UnpaidLoan {
  id: number;
  userId: number;
  organizationId: number;
  tenantId: number;
  amount: number;
  interestRate: number;
  dueDate: Date;
  totalRepayable: number;
  status: LoanStatus;
  approvalCount: number;
  createdAt: Date;
  updatedAt: Date;
 
  firstApproverId: number | null;
  secondApproverId: number | null;
  thirdApproverId: number | null;
  

  duration: number;
  user?: User;
  organization: Organization;
 
}

export  interface Organization {
  id: number;
  name: string;
  approvalSteps: number;
  loanLimitMultiplier: number;
  interestRate: number;
}
export  interface PaymentConfirmation {
  id: number;
  loanId: number;
  amount: number;
  method: string | null; // Allow null to match Prisma schema
  status: PayoutStatus;
  transactionId: string | null;
  tenantId: number;
  createdAt: Date;
  updatedAt: Date;
}

interface ConsolidatedRepayment {
  id: number;
  userId: number;
  organizationId: number;
  tenantId: number;
  amount: number;
  totalAmount: number | null;
  paidAt: Date | null;
  status: string | null;
  createdAt: Date;
  updatedAt: Date;
}





export  interface LoanPayout {
  id: number;
  loanId: number;
  amount: number;
  method: string | null; // Allow null to match Prisma schema
  status: PayoutStatus;
  approvedById: number | null;
  tenantId: number;
  transactionId: string | null;
  createdAt: Date;
  updatedAt: Date;
  approvedBy?: User; // Optional relation
  confirmation?: PaymentConfirmation | null; // Optional relation
}

export  interface MpesaResponse {
  ConversationID?: string;
  OriginatorConversationID?: string;
  ResponseCode?: string;
  transactionId?: string;
}

export  interface DisbursementResult {
  loan: Loan;
  mpesaResponse: MpesaResponse;
}

export  interface ApiResponse<T> {

  success: boolean;
  message: string;
  data: T | null;
  error?: string | null;

}

export  interface ErrorResponse {
  message: string;
  error?: string;
}

export interface AutoApprovalResponse {
  loan: Loan;
  loanPayout: any;
  disbursement: any;
}
