import { LoanStatus } from "@prisma/client";

// 1. Minimal Loan object
export type MinimalLoan = {
  id: number;
  amount: number;
  interestRate: number;
  status: LoanStatus;
  createdAt: Date;
  dueDate: Date;
};

// 2. Linked user (login profile + loan history)
export type LinkedUserWithMinimalLoans = {
  id: number;
  email?: string | null;
  phoneNumber: string;
  firstName: string;
  lastName: string;
  createdAt?: Date;
  loans: MinimalLoan[];
};

// 3. The full EmployeeWithExtras interface
export type EmployeeWithExtras = {
  id: number;
  phoneNumber: string;
  idNumber: string;
  firstName: string;
  lastName: string;
  grossSalary: number;
  jobId?: string | null;
  secondaryPhoneNumber?: string | null;
  tenantId: number;

  organizationId: number;
  createdAt: Date;
  updatedAt: Date;

  // Optional related info
  tenant?: {
    name: string;

  };

  organization?: {
    id: number;
    name: string;
  };

  user?: LinkedUserWithMinimalLoans | null;
};


export type Employees = {
  id: number;
  phoneNumber: string;
  idNumber: string;
  firstName: string;
  lastName: string;
  grossSalary: number;
  jobId?: string | null;
  secondaryPhoneNumber?: string | null;
  tenantId: number;

  organizationId: number;
  createdAt: Date;
  updatedAt: Date;

  // Optional related info
  tenant?: {
    name: string;

  };

  organization?: {
    id: number;
    name: string;
  };

 
};



export type PaginatedResponse<T> = {
  total: number;
  data: T[];
};



export interface EmployeeInput {
  organizationId: number;
  phoneNumber: string;
  idNumber: string;
  grossSalary: number;
  firstName: string;
  lastName: string;
   jobId?: string | null;
  secondaryPhoneNumber?: string | null;
}



export interface Employee {
  id: number;
  phoneNumber: string;
  idNumber: string;
  firstName: string;
  lastName: string;
  grossSalary: number;
  jobId?: string | null;
  secondaryPhoneNumber?: string | null;
  tenantId: number;
  organizationId: number;
  createdAt: Date;
  updatedAt: Date;
}


export interface EmployeeWithRelations extends Employee {
  tenant?: {
    name: string;
  };
  organization?: {
    id: number;
    name: string;
  };
  user?: {
    id: number;
    phoneNumber: string;
    email: string | null;
    firstName: string;
    lastName: string;
    loans: MinimalLoan[];
    createdAt: Date;
  } | null;
}


export interface APIResponse<T = any> {
  message?: string;
  error?: string;
  employee?: T;
  employees?: T | null;
  total?: number;
  data?: T[];
}

export type APIResponseEmployee<T> = {
  success: boolean;
  message?: string;
  data?: T|null;
}

export type APIResponseGetUser<T> = {
  success: boolean;
  message: string;
  data: T | null;
  error?: string | null;
}