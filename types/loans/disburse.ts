
export interface B2CPaymentPayload {
  amount: number;
  phoneNumber: string;
  queueTimeoutUrl: string;
  resultUrl: string;
  b2cShortCode: string;
  initiatorName: string;
  securityCredential: string;
  consumerKey: string;
  consumerSecret: string;
  remarks?: string;
  originatorConversationID?: string;
}

export interface DisbursePayload {
  phoneNumber: string;
  amount: number;
  loanId?: number | null;
  userId?: number | null;
  tenantId?: number | null;
}


export interface DisbursementResult {
  success: boolean;
  mpesaResponse?: {
    TransactionID?: string;
    ConversationID?: string;
    ResponseCode?: string;
    ResultType?: number;
    ResultCode?: number;
    ResultDesc?: string;
    ResultParameters?: { ResultParameter: { Key: string; Value: string }[] };
  };
  error?: string;
  loan?: any; // Adjust based on actual Loan type if needed
}
export interface MPesaBalance {
  id: number;
  tenantId: number;
  utilityAccountBalance: number | null;
  createdAt: Date;
  updatedAt: Date;
}



export interface LoanToDisburse{
  id: number;
  status: string;
  amount: number;
  organizationId: number;
  tenantId: number;
  disbursedAt: Date | null;
  user: {
    id: number;
    phoneNumber: string;
  };
}

// Interface for the employee object from Prisma
export interface Employee {
  organizationId: number;
}

// Interface for the M-Pesa response from disburseB2CPayment
export interface MpesaResponseDisburse {
  ConversationID?: string;
  OriginatorConversationID?: string;
  ResponseCode: string;
}

// Interface for the disburseB2CPayment function parameters
export interface DisburseB2CPaymentParams {
  phoneNumber: string;
  amount: number;
}

