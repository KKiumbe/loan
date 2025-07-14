
export interface RolePermissions {
  [role: string]: {
    tenant: string[];
    organization: string[];
    org_admin: string[];
    employee: string[];
    user: string[];
    mpesa: string[];
    loan: string[];
    payment: string[];
    tenant_config: string[];
    audit_log: string[];
    report: string[];
    profile: string[];
    sms_history: string[];
    backup: {
      create: boolean;
      [key: string]: boolean; // Add index signature for object case
    };
    [module: string]: string[] | { [key: string]: boolean };
  };
}


const ROLE_PERMISSIONS: RolePermissions = {
  ADMIN: {
    tenant: ['read', 'update'],
    organization: ['create', 'read', 'update', 'delete'],
    org_admin: ['create', 'read', 'update', 'delete'],
    employee: ['create', 'read', 'update', 'delete'],
    user: ['create', 'read', 'update', 'delete'],
    mpesa: ['create', 'read', 'update', 'delete'],
    loan: ['create', 'read', 'update', 'delete', 'approve', 'reject', 'disburse'],
    payment: ['create', 'read', 'update', 'delete', 'manage'],
    tenant_config: ['create', 'read', 'update', 'delete'],
    sms_history: [],


    audit_log: ['read'],
    report: ['read'],
    backup: {
      create: true
    },
    profile: []
  },
  ORG_ADMIN: {
    employee: ['create', 'read', 'update', 'delete'],
    user: ['create', 'read', 'update', 'delete'],
    loan: ['read', 'approve', 'reject', 'disburse'],
    payment: ['create', 'read', 'update', 'delete', 'manage'],
    backup: {
      create: false
    },
    tenant: [],
    organization: [],
    org_admin: [],
    mpesa: ['create', 'read', 'update', 'delete'],
    tenant_config: [],
    audit_log: [],
    report: [],
    profile: [],
    sms_history: []
  },

  EMPLOYEE: {
    loan: ['create', 'read_own', 'repay'],
    payment: ['read_own'],
    profile: ['read_own', 'update_own'],
    backup: {
      create: false
    },
    tenant: [],
    organization: [],
    org_admin: [],
    employee: [],
    user: [],
    mpesa: [],
    tenant_config: [],
    audit_log: [],
    report: [],
    sms_history: []
  },
};

export default ROLE_PERMISSIONS;