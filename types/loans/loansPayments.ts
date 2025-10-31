// src/interfaces/mpesaInterfaces.ts

import { PayoutStatus } from "@prisma/client";
import { Organization, Tenant, User } from "./loan";



export interface MpesaResult {
  ResultType?: number;
  ResultCode: number;
  ResultDesc?: string;
  ConversationID: string;
  OriginatorConversationID: string;
  TransactionID?: string;
  ResultParameters: {
    ResultParameter?: Array<{ Key: string; Value: string | number }>;
  };
}

export interface MpesaTimeout {
  ConversationID?: string;
  OriginatorConversationID?: string;
}

export interface MpesaBalanceResult {
  ResultType: number;
  ResultCode: number;
  ResultDesc: string;
  ConversationID: string;
  OriginatorConversationID: string;
  TransactionID: string;
  ResultParameters: {
    ResultParameter: Array<{ Key: string; Value: string | number }>;
  };
}

export interface MpesaConfig {
  consumerKey: string;
  consumerSecret: string;
  b2cShortCode: string;
  initiatorName: string;
  securityCredential: string;
  tenantId: number;
  shortCode: string;
}

export interface TenantSettingsResponse {
  success: boolean;
  mpesaConfig: MpesaConfig;
}

export interface MpesaBalance {
  id: number;
  resultType: number;
  resultCode: number;
  resultDesc: string;
  originatorConversationID: string;
  conversationID: string;
  transactionID: string;
  workingAccountBalance?: number | null;
  utilityAccountBalance?: number | null;
  tenantId: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Loan {
  id: number;
  tenantId: number;
  userId: number;
  status: string;
  mpesaStatus?: string | null;
  disbursedAt?: Date | null;
  mpesaTransactionId?: string | null;
  originatorConversationID?: string | null;
  amount: number;
  interestRate: number;
  createdAt: Date;
  organization: {
    name: string;
    id: number;
    
  };
  user: {
    firstName: string;
    lastName: string;
    phoneNumber: string;
  };
}

export interface MpesaPaymentData {
  BusinessShortCode: string;
  TransID: string;
  TransTime: string;
  TransAmount: string;
  BillRefNumber: string;
  MSISDN: string;
  FirstName: string;
}

export interface MpesaTransaction {
  id: number;
  TransID: string;
  TransTime: string;
  ShortCode: string;
  TransAmount: number;
  BillRefNumber: string;
  MSISDN: string;
  FirstName: string;
  tenantId: number;
  processed: boolean;
  createdAt: Date;
  updatedAt: Date;
}




export interface LoanPayout {
  id: number;
  loanId: number;
  amount: number;
  method: string | null | undefined;
  transactionId: string | null | undefined;
  status: string;
  tenantId: number;
  createdAt: Date;
  updatedAt: Date;
  loan: Loan | null;
  user: {
    firstName: string;
    lastName: string;
  } | null;
  confirmation: {
    id: number;
    amountSettled: number;
    settledAt: Date;
    paymentBatch: {
      id: number;
      reference: string | null;
      paymentMethod: string;
      totalAmount: number;
      receivedAt: Date;
      remarks: string | null;
    };
  } | null;
}




export interface LoanPayoutSearchByName {
  id: number;
  loanId: number;
  amount: number;
  method: string | null;
  transactionId: string | null;
  status: string;
  tenantId: number;
  createdAt: Date;
  updatedAt: Date;
  loan: {
    id: number;
    tenantId: number;
    userId: number;
    amount: number;
    interestRate: number;
    status: string;
    createdAt: Date;
    user: {
      firstName: string;
      lastName: string;
      phoneNumber: string;
    } | null;
    organization: {
      id: number;
      name: string;
    } | null;
    approvedBy: {
    
      firstName: string;
      lastName: string;
      
    } | null;
  } | null;
  user: { firstName: string; lastName: string } | null;

  confirmation: {
    id: number;
    amountSettled: number;
    settledAt: Date;
    paymentBatch: {
      id: number;
      reference: string | null;
      paymentMethod: string;
      totalAmount: number;
      receivedAt: Date;
      remarks: string | null;
    } | null;
  } | null;
}


export interface PaymentBatch {
  id: number;
  organizationId: number;
  tenantId: number;
  totalAmount: number;
  paymentMethod: string;
  reference?: string | null;
  remarks?: string | null;
  receivedAt: Date;
  organization: {
    id: number;
    name: string;
  };
  confirmations: { id: number }[];
}

export interface PaymentConfirmation {
  id: number;
  paymentBatchId: number;
  loanPayoutId: number;
  amountSettled: number;
  settledAt: Date;
  paymentBatch: {
    id: number;
    reference?: string | null;
    paymentMethod: string;
    remarks?: string | null;
    receivedAt: Date;
    organization: {
      id: number;
      name: string;
    };
  };
  loanPayout: {
    id: number;
    amount: number;
    loan: {
      amount: number;
      user: {
        firstName: string;
        lastName: string;
      };
    };
  };
}

// Placeholder for Payment model (adjust based on actual schema)
export interface Payment {
  id: string;
  transactionId: string;
  tenantId: number;
  firstName: string;
  modeOfPayment?: string | null;
  receipted: boolean;
  createdAt: Date;
  receipt?: {
    receiptInvoices: {
      invoice: {
        id: number;
        // Add other invoice fields as needed
      };
    }[];
  } | null;
}


export type PaymentConfirmationCreateNestedManyWithoutPaymentBatchInput = {
  create: PaymentConfirmation[];
  connect: PaymentConfirmation[];
};


export interface ConsolidatedRepayment {
  id: number;
  userId?: number | null;
  organizationId: number;
  tenantId: number;
  amount: number;
  totalAmount: number | null;
  paidAt?: Date | null;
  status?: string | null;
  createdAt: Date;
  updatedAt: Date;
  user?: User;
  organization?:Organization;
  tenant?: Partial<Tenant>;
  loans?: Partial<Loan>[];
}
