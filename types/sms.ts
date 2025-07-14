// Interfaces for type safety
export interface SMSConfig {
   id: number;
  tenantId: number;
  partnerId: string; // Incorrect casing
  apiKey: string;   // Incorrect casing
  shortCode: string;
  customerSupportPhoneNumber: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SMSMessage {
  mobile: string;
  message: string;
}

export interface SMSPayload {
  apikey: string;
  partnerID: string;
  message: string;
  shortcode: string;
  mobile: string;
}

export interface SMSResponse {
  status: string;
  message: string;
  // Add other fields based on your SMS provider's response
}

export interface Customer {
  id: number;
  phoneNumber: string;
  firstName: string;
  closingBalance: number;
  monthlyCharge?: number;
  invoices?: {
    id: number;
    invoiceAmount: number;
    invoicePeriod: Date;
    InvoiceItem: { description: string; amount: number }[];
  }[];
}


// Interface for SMS configuration data
export interface SMSConfigData {
  partnerId: string;
  apiKey: string;
  shortCode: string;
  customerSupportPhoneNumber: string;
}

// Interface for tenant update data
export interface TenantUpdateData {
  subscriptionPlan: string;
  monthlyCharge: number;
}

// Interface for the return type of the function
export interface ConfigureTenantSettingsResult {
  success: boolean;
  message: string;
  error?: string;
}

export interface SMSConfigInput {
  partnerId?: string;
  apiKey?: string;
  shortCode?: string;
  customerSupportPhoneNumber?: string;
}

// Interface for authenticated user (from req.user)
export interface AuthenticatedUser {
  tenantId: number;
}


// Interface for API response
export interface APIResponse {
  message: string;
  data?: SMSConfig;
  error?: string;
}