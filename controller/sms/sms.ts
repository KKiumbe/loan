// src/sms/smsServices.ts
import { Request, Response, NextFunction } from 'express';
import axios, { AxiosResponse } from 'axios';
import { PrismaClient, SMSStatus } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { getSMSConfigForTenant } from '../smsConfig/getSMSConfig';
import { AuthenticatedRequest } from '../../middleware/verifyToken';

import { SMSMessage, SMSPayload, SMSResponse } from '../../types/sms';

const prisma = new PrismaClient();

// Environment variables
const SMS_ENDPOINT = process.env.SMS_ENDPOINT as string | undefined;
const BULK_SMS_ENDPOINT = process.env.BULK_SMS_ENDPOINT as string | undefined;
const SMS_BALANCE_URL = process.env.SMS_BALANCE_URL as string | undefined;



// Function to fetch short code
export const getShortCode = async (tenantId: number): Promise<string | null> => {
  try {
    const config = await prisma.mPESAConfig.findUnique({
      where: { tenantId },
      select: { b2cShortCode: true },
    });
    return config ? config.b2cShortCode : null;
  } catch (error) {
    console.error('Error fetching shortCode:', error);
    return null;
  }
};

// Function to check SMS balance
export const checkSmsBalance = async (apiKey: string, partnerId: string): Promise<number> => {
  if (!apiKey || !partnerId) {
    throw new Error('API key or partner ID is missing');
  }

  console.log(`Checking SMS balance with apiKey: ${apiKey} and partnerId: ${partnerId}`);

  try {
    const response: AxiosResponse<{ balance: number }> = await axios.post(SMS_BALANCE_URL!, {
      apikey: apiKey,
      partnerID: partnerId,
    });
    console.log('SMS balance:', response.data.balance);
    return response.data.balance;
  } catch (error: any) {
    console.error('Error checking SMS balance:', error.response?.data || error.message);
    throw new Error('Failed to retrieve SMS balance');
  }
};

// Function to sanitize phone numbers
export const sanitizePhoneNumber = (phone: string): string => {
  if (typeof phone !== 'string' || phone.trim() === '') {
    console.error('Invalid phone number format:', phone);
    return '';
  }
  const phoneRegex = /^\+?\d{10,15}$/;
  if (!phoneRegex.test(phone)) {
    console.error('Invalid phone number format:', phone);
    return '';
  }
  if (phone.startsWith('+254')) return phone.slice(1);
  if (phone.startsWith('0')) return `254${phone.slice(1)}`;
  if (phone.startsWith('254')) return phone;
  return `254${phone}`;
};

// Get SMS balance endpoint




export const getLatestBalance = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    console.log('getLatestBalance: Starting for user:', req.user);

    if (!req.user) {
      console.log('getLatestBalance: No user in request');
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const { tenantId } = req.user;
    console.log('getLatestBalance: Fetching SMS config for tenantId:', tenantId);
    const { apikey, partnerID } = await getSMSConfigForTenant(tenantId);
    console.log('getLatestBalance: SMS config:', { apikey, partnerID });

    if (!apikey || !partnerID) {
      console.log('getLatestBalance: SMS config not found');
      res.status(404).json({ message: 'SMS config not found' });
      return;
    }

    console.log('getLatestBalance: Sending axios request to SMS_BALANCE_URL');
    const response = await axios.post(
      process.env.SMS_BALANCE_URL!,
      { apikey, partnerID },
      { timeout: 5000 }
    );

    console.log('getLatestBalance: Axios response:', response.data);

    // Validate response.data.credit
    if (!response.data || typeof response.data.credit === 'undefined') {
      console.log('getLatestBalance: Invalid or missing credit in response');
      res.status(200).json({
        credit: 'N/A',
        message: 'Invalid response from SMS balance API',
      });
      return;
    }

    console.log('getLatestBalance: Sending success response with credit:', response.data.credit);
    res.status(200).json({ credit: response.data.credit });
    return;

  } catch (error: any) {
    console.error('getLatestBalance: Error:', error.code || error.message, error.stack);

    if (res.headersSent) {
      console.warn('getLatestBalance: Headers already sent, skipping response');
      return;
    }

    const isTimeout = error.code === 'ECONNABORTED';
    console.log('getLatestBalance: Sending error response, timeout:', isTimeout);
    res.status(200).json({
      credit: 'N/A',
      message: isTimeout
        ? 'SMS balance request timed out. Try again later.'
        : 'Unable to fetch SMS balance. Please try again later.',
    });
    return;
  }
};


// Send SMS to one customer
export const sendToOne = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { tenantId } = req.user!;
  const { mobile, message } = req.body as { mobile?: string; message?: string };

  if (!mobile || !message) {
    res.status(400).json({ success: false, message: 'Mobile and message are required' });
    return;
  }



  try {
    const response = await sendSMS(tenantId, mobile, message);
    res.status(200).json({ success: true, response });
  } catch (error: any) {
    console.error('Error in sendToOne:', error.message);
    next(error);
  }
};

// Core sendSMS function
export const sendSMS = async (
  tenantId: number,
  mobile: string,
  message: string
): Promise<SMSResponse> => {
  console.log(`Sending SMS to ${mobile}`);
  let clientsmsid: string | undefined = undefined;

  try {
    if (!SMS_ENDPOINT) {
      throw new Error('SMS_ENDPOINT is not configured');
    }

    const { partnerID, apikey, shortCode } = await getSMSConfigForTenant(tenantId);
    const sanitizedPhoneNumber = sanitizePhoneNumber(mobile);
    if (!sanitizedPhoneNumber) {
      throw new Error('Invalid phone number');
    }

    clientsmsid = uuidv4();
    console.log(`Creating SMS record with clientsmsid: ${clientsmsid}`);

    const smsRecord = await prisma.sMS.create({
      data: {
        tenantId,
        clientsmsid,
        mobile: sanitizedPhoneNumber,
        message,
        status: SMSStatus.PENDING,
      },
    });
    console.log(`SMS record created: ${JSON.stringify(smsRecord)}`);

    const payload: SMSPayload = {
      apikey,
      partnerID,
      message,
      shortcode: shortCode,
      mobile: sanitizedPhoneNumber,
    };

    console.log(`Sending SMS with payload: ${JSON.stringify(payload)}`);

    const SMS_TIMEOUT = 10000; // 10 seconds
    const response: AxiosResponse<SMSResponse> = await axios.post(SMS_ENDPOINT, payload, {
      timeout: SMS_TIMEOUT,
    });
    console.log(`SMS sent successfully to ${sanitizedPhoneNumber}:`, response.data);

    await prisma.sMS.update({
      where: { id: smsRecord.id },
      data: { status: SMSStatus.SENT },
    });
    console.log(`SMS status updated to SENT for clientsmsid: ${clientsmsid}`);

    return response.data;
  } catch (error: any) {
    console.error('Error sending SMS:', {
      message: error.message,
      stack: error.stack,
      mobile,
    });

    if (clientsmsid) {
      try {
        await prisma.sMS.update({
          where: { clientsmsid },
          data: { status: SMSStatus.FAILED },
        });
        console.log(`SMS status updated to FAILED for clientsmsid: ${clientsmsid}`);
      } catch (updateError) {
        console.error('Error updating SMS status to FAILED:', updateError);
      }
    }

    throw new Error(error.response ? error.response.data.message : 'Failed to send SMS');
  }
};

// Bulk SMS sending function
export const sendSms = async (tenantId: number, messages: SMSMessage[]): Promise<SMSResponse[]> => {
  try {
    if (!BULK_SMS_ENDPOINT) {
      throw new Error('BULK_SMS_ENDPOINT is not configured');
    }

    const { partnerID, apikey, shortCode } = await getSMSConfigForTenant(tenantId);
    if (!partnerID || !apikey || !shortCode) {
      throw new Error('Missing SMS configuration for tenant');
    }

    const smsList = messages.map((msg) => ({
      apikey,
      partnerID,
      message: msg.message,
      shortcode: shortCode,
      mobile: String(msg.mobile),
    }));

    const batchSize = 450;
    const batches: SMSPayload[][] = [];
    for (let i = 0; i < smsList.length; i += batchSize) {
      batches.push(smsList.slice(i, i + batchSize));
    }

    const allResponses: SMSResponse[] = [];

    for (const batch of batches) {
      const payload = { smslist: batch };
      console.log(`Sending SMS payload: ${JSON.stringify(payload)}`);

      let response: AxiosResponse<SMSResponse>;
      try {
        response = await axios.post(BULK_SMS_ENDPOINT, payload);
        console.log(`Batch of ${batch.length} SMS sent successfully:`, response.data);
      } catch (error: any) {
        console.error('Bulk SMS API error:', error.response?.data || error.message);
        response = { data: { status: 'FAILED', message: 'Bulk SMS failed' } } as AxiosResponse<SMSResponse>;
      }

      const smsLogs = batch.map((sms) => ({
        clientsmsid: uuidv4(),
        tenantId,
        mobile: sms.mobile,
        message: sms.message,
        status: response.data.status === 'FAILED' ? SMSStatus.FAILED : SMSStatus.SENT,
        createdAt: new Date(),
      }));

      await prisma.sMS.createMany({ data: smsLogs });
      allResponses.push(response.data);
    }

    return allResponses;
  } catch (error: any) {
    console.error('Error sending SMS:', error);
    throw new Error('Failed to send SMS');
  }
};



export default {
  
  sendSMS,
  sendSms,
  sendToOne,
  checkSmsBalance,
  getLatestBalance,
 
  getShortCode,
};