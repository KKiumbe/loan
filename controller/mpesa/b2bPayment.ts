// src/utils/mpesaB2C.ts
import { PrismaClient } from '@prisma/client';
import { AuthenticatedRequest } from '../../middleware/verifyToken';
import { Response } from 'express';
import { AccountBalanceRequest, ApiResponse } from '../../types/payment/b2b';
import { getTenantSettings, isMPESASettingsSuccess } from './mpesaConfig';
import dotenv from 'dotenv';
import axios from 'axios';
import { getMpesaAccessToken } from './token';
dotenv.config();

const prisma = new PrismaClient();



export const initiateB2BTransfer = async (
  req: AuthenticatedRequest,
  res: Response<ApiResponse<any>>
): Promise<void> => {
  try {
    const tenantId = req.user?.tenantId!;
    const settings = await getTenantSettings(tenantId);

    if (!isMPESASettingsSuccess(settings)) {
      throw new Error(settings.message);
    }




    const { mpesaConfig } = settings;

    console.log(`object mpesaConfig: ${JSON.stringify(mpesaConfig)}`);

    const accessToken = await getMpesaAccessToken(mpesaConfig.consumerKey, mpesaConfig.consumerSecret);
    console.log(`this is the access token ${accessToken}`);


async function callMpesaB2B(payload: any): Promise<any> {
  try {
    const response = await axios.post(process.env.MPESA_B2B_URL ?? '', payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      timeout: 30000,
    });

    return response.data;
  } catch (error: any) {
    console.error("M-Pesa B2B Error:", error.response?.data || error.message);
    throw new Error(
      error.response?.data?.errorMessage ||
      error.response?.data?.error_description ||
      error.message ||
      "An unknown error occurred"
    );
  }
}


  const resultUrl = `${process.env.APP_BASE_URL}/api/b2b-result`;
    const queueTimeoutUrl = `${process.env.APP_BASE_URL}/api/b2b-timeout`;

   const payload = {
  Initiator: mpesaConfig.initiatorName,
  SecurityCredential: mpesaConfig.securityCredential,
  CommandID: "BusinessTransferFromMMFToUtility",
  SenderIdentifierType: "4",   // 4 = Shortcode
  RecieverIdentifierType: "4", // 4 = Shortcode
  Amount: req.body.amount,
  PartyA: mpesaConfig.b2cShortCode,
  PartyB: mpesaConfig.b2cShortCode,
  Remarks: req.body.remarks ?? "Transfer to utility account",
  QueueTimeOutURL: queueTimeoutUrl,
  ResultURL: resultUrl,
  AccountReference: "UtilityPayment" // optional but good to include
};


    const response = await callMpesaB2B(payload);

    res.json({
      success: true,
      message: "B2B transfer initiated successfully",
      data: response
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
      data: null
    });
  }
};








export const getAccountBalance = async (  req: AuthenticatedRequest,
  res: Response<ApiResponse<any>>
): Promise<void> => {

     const tenantId = req.user?.tenantId!;
    const settings = await getTenantSettings(tenantId);

    if (!isMPESASettingsSuccess(settings)) {
      throw new Error(settings.message);
    }




    const { mpesaConfig } = settings;

    console.log(`object mpesaConfig: ${JSON.stringify(mpesaConfig)}`);

    const accessToken = await getMpesaAccessToken(mpesaConfig.consumerKey, mpesaConfig.consumerSecret);
    console.log(`this is the access token ${accessToken}`);

      const queueTimeoutUrl = `${process.env.APP_BASE_URL}/api/${tenantId}/b2b-timeout`;
      const resultUrl = `${process.env.APP_BASE_URL}/api/${tenantId}/acc-balance`;
  try {
    const payload = {
      Initiator: mpesaConfig.initiatorName,
      SecurityCredential: mpesaConfig.securityCredential,
      CommandID: "AccountBalance",
      PartyA: mpesaConfig.b2cShortCode,
      IdentifierType: "4",
      Remarks: "ok",
      QueueTimeOutURL: queueTimeoutUrl,
      ResultURL: resultUrl,
    };



    const url = `${process.env.MPESA_ACCOUNT_BALANCE_URL}`;

    const { data } = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    const result = {
      success: true,
      message: "Account balance fetched successfully",
      data,
    };
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message, data: null });
  }
};
