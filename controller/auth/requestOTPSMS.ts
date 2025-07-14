// src/sms/sms.ts
import axios, { AxiosResponse } from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Load environment variables with type safety
const SMS_API_KEY = process.env.SMS_API_KEY as string | undefined;
const PARTNER_ID = process.env.PARTNER_ID as string | undefined;
const SHORTCODE = process.env.SHORTCODE as string | undefined;
const SMS_ENDPOINT = process.env.SMS_ENDPOINT as string | undefined;
const SMS_BALANCE_URL = process.env.SMS_BALANCE_URL as string | undefined;

// Interface for customer object
interface Customer {
  phoneNumber: string;
}

// Interface for SMS payload
interface SMSPayload {
  partnerID: string;
  apikey: string;
  message: string;
  shortcode: string;
  mobile: string;
}

// Interface for SMS API response (adjust based on actual API response)
interface SMSResponse {
  // Define based on your SMS provider's response structure
  status: string;
  message: string;
  // Add other fields as needed
}

// Function to send SMS with balance check
export const sendSMS = async (tenantId: number, text: string, customer: Customer): Promise<SMSResponse> => {
  if (!SMS_API_KEY || !PARTNER_ID || !SHORTCODE || !SMS_ENDPOINT) {
    throw new Error('Missing required SMS configuration environment variables');
  }

  try {
    const mobile = sanitizePhoneNumber(customer.phoneNumber);

    if (!mobile) {
      throw new Error('Invalid phone number format');
    }

    // Prepare the payload to send the SMS
    const payload: SMSPayload = {
      partnerID: PARTNER_ID,
      apikey: SMS_API_KEY,
      message: text,
      shortcode: SHORTCODE,
      mobile,
    };

    console.log(`Sending SMS to ${mobile} with payload: ${JSON.stringify(payload)}`);

    // Send the SMS
    const response: AxiosResponse<SMSResponse> = await axios.post(SMS_ENDPOINT, payload);

    // Log the SMS attempt in the database (optional, for auditing)
 

    return response.data;
  } catch (error) {
    console.error('Error sending SMS:', error);
    throw new Error('Failed to send SMS');
  }
};

// Function to sanitize phone numbers
export const sanitizePhoneNumber = (phone: string): string => {
  if (typeof phone !== 'string' || phone.trim() === '') {
    console.error('Invalid phone number format:', phone);
    return '';
  }

  if (phone.startsWith('+254')) {
    return phone.slice(1);
  } else if (phone.startsWith('0')) {
    return `254${phone.slice(1)}`;
  } else if (phone.startsWith('254')) {
    return phone;
  } else {
    return `254${phone}`;
  }
};

export default { sendSMS, sanitizePhoneNumber };