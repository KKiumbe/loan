// src/types/organization.ts
export interface CreateOrganizationRequest {
  name: string;
  approvalSteps: number;
  loanLimitMultiplier: number;
  interestRate: number;
}


export interface Organization {
  id: number;
  name: string;
  interestRate: number;
  approvalSteps: number;
  loanLimitMultiplier: number;
  // Add more if needed
}


// Interface for query parameters
export interface SearchQueryParams {
  name?: string;
  page?: string;
  limit?: string;
}

export interface GetBorrowerOrganizationsQuery {
  tenantId?: string;
}

export interface OrganizationParams{

  organizationId: string;

}

export interface OrganizationriolizedAdminsResponse{
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phoneNumber: string;
  organization: {
    id: number;
    name: string;
  } | null;
  createdAt: Date;
}


// Interface for query params
export interface SearchQueryParams {
  name?: string;
  page?: string;
  limit?: string;
}

// Interface for response data shapes
export interface OrganizationSearchResponse {
  id: number;
  name: string;
  approvalSteps: number;
  interestRate: number | null;
  employeeCount: number | null;
  loanCount: number | null;
  batchCount: number | null;
  createdAt: Date;
}

export interface OrganizationStatsResponse {
  id: number;
  name: string;
  approvalSteps: number;
  interestRate: number;
  employeeCount: number;
  loanCount: number;
  totalLoanAmount: number;
  approvedLoanAmount: number;
  createdAt: Date;
}

export interface OrganizationAdminResponse {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phoneNumber: string;
  organization: {
    id: number;
    name: string;
  } | null;
  createdAt: Date;
}
