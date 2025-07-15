// src/interfaces/mpesaInterfaces.ts

export interface MpesaResultWrapper {
  Result: {
    ResultType?: number;
    ResultCode: number;
    ResultDesc?: string;
    ConversationID: string;
    tenantId?: number;
    OriginatorConversationID: string;
    TransactionID?: string;
    ResultParameters: {
      ResultParameter?: Array<{ Key: string; Value: string | number }>;
    };
  };
}



export interface MpesaTimeout {
  ConversationID?: string;
  OriginatorConversationID?: string;
}

// export interface B2CResult {
//   ConversationID: string;
//   OriginatorConversationID: string;
//   ResultCode: number;
//   TransactionID: string;
//   ResultDesc: string;
//   ResultParameters: {
//     ResultParameter: Array<{ Key: string; Value: string | number }>;
//   };
// }

export interface MpesaConfig {
  consumerKey: string;
  consumerSecret: string;
  b2cShortCode: string;
  initiatorName: string;
  securityCredential: string;
}

export interface TenantSettingsResponse {
  success: boolean;
  message?: string;

  mpesaConfig?: MpesaConfig;
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

export interface LatestMpesaBalance {
  utilityAccountBalance: number; // Adjust based on actual type
  // Add other properties as needed
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
}

export interface ResponseMpesaBalance{
  
  id: number;
  workingAccountBalance?: number | null;
  utilityAccountBalance?: number | null;

}