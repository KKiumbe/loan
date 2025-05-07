const ROLE_PERMISSIONS = {
  TENANT_ADMIN: ['create_organization', 'create_org_admin'],
  ADMIN: ['add_employee', 'approve_loan', 'reject_loan', 'disburse_loan', 'view_all_loans'],
  EMPLOYEE: ['apply_loan', 'repay_loan', 'view_own_loans'],
};



module.exports = ROLE_PERMISSIONS;