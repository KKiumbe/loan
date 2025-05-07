const ROLE_PERMISSIONS = {
  ADMIN: {
    tenant: ['read', 'update'], // Manage Lender Organization (Tenant) details
    borrower_organization: ['create', 'read', 'update', 'delete'], // Manage Borrower Organizations
    org_admin: ['create', 'read', 'update', 'delete'], // Manage ORG_ADMIN users
    employee: ['create', 'read', 'update', 'delete'], // Manage EMPLOYEE users
 
    loan: ['create', 'read', 'update', 'delete', 'approve', 'reject', 'disburse'],
    payments: ['create', 'read', 'update', 'delete', 'manage'], // ConsolidatedRepayment
    tenant_config: ['create', 'read', 'update', 'delete'], // MpesaConfig, SMSConfig
    audit_log: ['read'],
    report: ['read'],
  },
  ORG_ADMIN: {
    employee: ['create', 'read', 'update', 'delete'], // Within their Borrower Organization
    loan: ['read', 'approve', 'reject', 'disburse'], // Within their Borrower Organization
    payments: ['create', 'read', 'update', 'delete', 'manage'], // Within their Borrower Organization
  },
  EMPLOYEE: {
    loan: ['create', 'read_own', 'repay'], // Apply and view own loans
    payments: ['read_own'], // View own repayments
    profile: ['read_own', 'update_own'], // Manage own profile
  },
};

module.exports = ROLE_PERMISSIONS;