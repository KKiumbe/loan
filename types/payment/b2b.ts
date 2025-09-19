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


export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T | null;
  error?: string | null;
}