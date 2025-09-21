export interface B2BPaymentPayload {
  Initiator: string;              // API operator (from Safaricom or provider)
  SecurityCredential: string;     // Encrypted initiator password
  CommandID: string;              // e.g. "BusinessTransferFromMMFToUtility"
  SenderIdentifierType: string;   // Usually "4" for shortcode
  RecieverIdentifierType: string; // Usually "4" for shortcode
  Amount: number;
  PartyA: string;                 // Your Working Account shortcode
  PartyB: string;                 // Utility Account shortcode
  Remarks: string;                // e.g. "Transfer to Utility"
  QueueTimeOutURL: string;
  ResultURL: string;
  Occasion?: string;              // Optional metadata
}

export interface AccountBalanceRequest {
  Initiator: string;
  SecurityCredential: string;
  CommandID: string;
  PartyA: string;
  IdentifierType: string;
  Remarks: string;
  QueueTimeOutURL: string;
  ResultURL: string;
}


export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T | null;
  error?: string | null;
}

export type MpesaResult = any;

export interface MpesaAccBalanceResult {
  Result: {
    ResultType: number;
    ResultCode: number;
    ResultDesc: string;
    OriginatorConversationID: string;
    ConversationID: string;
    TransactionID: string;
    mmfBalance: number;
    ResultParameters: {
      ResultParameter: { Key: string; Value: string }[];
    };
  }
}
