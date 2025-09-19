// src/utils/mpesaB2C.ts
import { PrismaClient } from '@prisma/client';
import { AuthenticatedRequest } from '../../middleware/verifyToken';
import { Response } from 'express';
import { ApiResponse } from '../../types/payment/b2b';
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
     
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 30000,
    });

    return response.data;
  } catch (error: any) {
    throw new Error(error.response?.data?.error_description || 'An error occurred');
  }
}

  const resultUrl = `${process.env.APP_BASE_URL}/api/b2b-result`;
    const queueTimeoutUrl = `${process.env.APP_BASE_URL}/api/b2b-timeout`;

    const payload = {
      amount: req.body.amount,
      partyA: mpesaConfig.b2cShortCode,
      partyB: mpesaConfig.b2cShortCode,
      initiatorName: mpesaConfig.initiatorName,
      securityCredential: mpesaConfig.securityCredential,
      consumerKey: mpesaConfig.consumerKey,
      consumerSecret: mpesaConfig.consumerSecret,
      commandID: "BusinessTransferFromMMFToUtility",
      remarks: req.body.remarks ?? "Transfer to utility account",
      queueTimeoutUrl: queueTimeoutUrl,
      resultUrl: resultUrl
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
