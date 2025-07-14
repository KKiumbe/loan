// src/interfaces/mpesaInterfaces.ts

// ... (previous interfaces unchanged)

export interface User {
  id: number;
  tenantId: number;
  employeeId?: number | null;
  role: string[];
  firstName: string;
  lastName: string;
  phoneNumber: string;
}

export interface LoanCapacity {
  canBorrow: boolean;
  remainingAmount: number;
  maxLoanAmount: number;
}

// ... (other interfaces unchanged)