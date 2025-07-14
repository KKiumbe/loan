// src/utils/mpesaConfig.ts
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Request, Response } from 'express';
import { MPesaBalance } from '../../types/disburse';
import { ResponseMpesaBalance } from '../../types/mpesa';

const prisma = new PrismaClient();


type MPESAConfigPayload = {
  tenantId: number;
  b2cShortCode: string;
  initiatorName: string;
  securityCredential: string;
  consumerKey: string;
  consumerSecret: string;
  name?: string;
};

export interface MPESAConfig {
  b2cShortCode: string;
  initiatorName: string;
  securityCredential: string;
  consumerKey: string;
  consumerSecret: string;
}

export type TenantMPESASettings =
  | { success: true; mpesaConfig: MPESAConfig }
  | { success: false; message: string };






 

export const createMPESAConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const { b2cShortCode, initiatorName, securityCredential, consumerKey, consumerSecret, tenantId }: MPESAConfigPayload =
      req.body;

    if (!tenantId || !b2cShortCode || !initiatorName || !securityCredential || !consumerKey || !consumerSecret) {
      res.status(400).json({
        message: 'All required fields (tenantId, b2cShortCode, initiatorName, securityCredential, consumerKey, consumerSecret) must be provided.',
      });
      return;
    }

    const existingConfig = await prisma.mPESAConfig.findUnique({ where: { tenantId } });
    if (existingConfig) {
      res.status(400).json({ message: 'M-Pesa B2C configuration already exists for this tenant.' });
      return;
    }

    const newConfig = await prisma.mPESAConfig.create({
      data: { tenantId, b2cShortCode, initiatorName, securityCredential, consumerKey, consumerSecret },
    });

    res.status(201).json({ success: true, message: 'M-Pesa B2C configuration created successfully.', data: newConfig });
  } catch (error: any) {
    console.error('Error creating M-Pesa configuration:', error.message);
    res.status(500).json({ success: false, message: 'Failed to create M-Pesa configuration.' });
  } 
};

export const updateMPESAConfig = async (req: Request, res: Response): Promise<void> => {
  const { tenantId, b2cShortCode, initiatorName, securityCredential, consumerKey, consumerSecret, name }: MPESAConfigPayload =
    req.body;

  try {
    const existing = await prisma.mPESAConfig.findUnique({ where: { tenantId } });
    if (!existing) {
      res.status(404).json({ success: false, message: 'No M-Pesa configuration found for this tenant.' });
      return;
    }

    const data: Partial<MPESAConfigPayload> = {
      ...(b2cShortCode && { b2cShortCode }),
      ...(initiatorName && { initiatorName }),
      ...(securityCredential && { securityCredential }),
      ...(consumerKey && { consumerKey }),
      ...(consumerSecret && { consumerSecret }),
      ...(name && { name }),
    };

    const updatedConfig = await prisma.mPESAConfig.update({
      where: { tenantId },
      data,
    });

    res.status(200).json({ success: true, message: 'M-Pesa configuration updated successfully.', data: updatedConfig });
  } catch (error: any) {
    console.error('Error updating M-Pesa config:', error.message);
    res.status(500).json({ success: false, message: 'An error occurred while updating configuration.' });
  } finally {
    await prisma.$disconnect();
  }
};

export function isMPESASettingsSuccess(
  settings: TenantMPESASettings
): settings is { success: true; mpesaConfig: MPESAConfig } {
  return settings.success === true;
}

export const getTenantSettings = async (tenantId: number): Promise<TenantMPESASettings> => {
  try {
    if (!tenantId) throw new Error('Tenant ID is required.');

    const certPath = path.resolve(__dirname, '../prodcert/ProductionCertificate.cer');
    const publicKey = fs.readFileSync(certPath, 'utf8');

    const mpesaConfig = await prisma.mPESAConfig.findUnique({
      where: { tenantId },
      select: {
        b2cShortCode: true,
        initiatorName: true,
        securityCredential: true,
        consumerKey: true,
        consumerSecret: true,
      },
    });

    if (!mpesaConfig) {
      throw new Error('No M-Pesa B2C settings found for this tenant.');
    }

    const buffer = Buffer.from(mpesaConfig.securityCredential, 'utf8');
    const encrypted = crypto.publicEncrypt(
      { key: publicKey, padding: crypto.constants.RSA_PKCS1_PADDING },
      buffer
    );
    const securityCredentialEncrypted = encrypted.toString('base64');

    return {
      success: true,
      mpesaConfig: {
        b2cShortCode: mpesaConfig.b2cShortCode,
        initiatorName: mpesaConfig.initiatorName,
        securityCredential: securityCredentialEncrypted,
        consumerKey: mpesaConfig.consumerKey,
        consumerSecret: mpesaConfig.consumerSecret,
      },
    };
  } catch (error: any) {
    console.error('Error fetching tenant M-Pesa settings:', error.message);
    return { success: false, message: error.message };
  } 
};

export const fetchLatestBalance = async (tenantId: number): Promise<ResponseMpesaBalance | null> => {
  try {
    return await prisma.mPesaBalance.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  } catch (error: any) {
    console.error('Error fetching latest M-Pesa balance:', error.message);
    throw error; // Re-throw to let caller handle
  } 
};