import { Tenant, UserStatus } from "@prisma/client";
import { Organization } from "./organization";

import { Loan } from "./loan";





export interface EmployeeDetails {
  id: number;
  phoneNumber: string;
  idNumber: string;
  grossSalary: number;
  jobId: string | null;
  secondaryPhoneNumber: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserDetailsWithRelations {
  id: number;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email: string | null;

  tenantId: number;
  organizationId: number | null;
  gender?: string | null;
  county?: string | null;
  town?: string | null;
  role: string[];
  createdBy?: number | null;
  status: UserStatus;
  mfaEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastLogin?: Date | null;
  loginCount: number;
  otpAttempts: number;
  resetCode?: string | null;
  resetCodeExpiresAt?: Date | null;
  tenantName?: string | null;

  tenant: Tenant;
  organization: Organization | null;
  employee: EmployeeDetails | null;
  loans: LoanWithOrg[];
}
