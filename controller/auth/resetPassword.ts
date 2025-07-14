// src/controller/auth/resetPassword.ts
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { sendSMS } from '../sms/sms'; // Adjust path

const prisma = new PrismaClient();

export const requestOTP = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { phoneNumber } = req.body as { phoneNumber?: string };

  if (!phoneNumber) {
    res.status(400).json({ message: 'Phone number is required' });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { phoneNumber },
      include: { tenant: true },
    });

    // Generic response for security
    if (!user) {
      res.status(404).json({ message: 'If the phone number exists, an OTP has been sent.' });
      return;
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.user.update({
      where: { phoneNumber },
      data: {
        resetCode: hashedOtp,
        resetCodeExpiresAt: otpExpiresAt,
        otpAttempts: 0,
      },
    });

    const message = `Your one-time password (OTP) is: ${otp}`;
    await sendSMS(user.tenantId, phoneNumber, message);

    res.status(200).json({ message: 'If the phone number exists, an OTP has been sent.' });
  } catch (error) {
    console.error('Error requesting OTP:', error);
    next(error);
  }
};

export const verifyOTP = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { phoneNumber, otp } = req.body as { phoneNumber?: string; otp?: string };

  if (!phoneNumber || !otp) {
    res.status(400).json({ message: 'Phone number and OTP are required' });
    return;
  }

  try {
    const user = await prisma.user.findUnique({ where: { phoneNumber } });

    if (!user || !user.resetCode) {
      res.status(400).json({ message: 'Invalid or expired OTP.' });
      return;
    }

    if (user.otpAttempts >= 5) {
      res.status(403).json({ message: 'Too many failed attempts. Please request a new OTP.' });
      return;
    }

    const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');
    const isOtpValid =
      hashedOtp === user.resetCode &&
      user.resetCodeExpiresAt !== null &&
      user.resetCodeExpiresAt > new Date();

    if (!isOtpValid) {
      await prisma.user.update({
        where: { phoneNumber },
        data: { otpAttempts: user.otpAttempts + 1 },
      });
      res.status(400).json({ message: 'Invalid or expired OTP.' });
      return;
    }

    await prisma.user.update({
      where: { phoneNumber },
      data: { resetCode: null, resetCodeExpiresAt: null, otpAttempts: 0 },
    });

    res.status(200).json({ message: 'OTP verified. You can now reset your password.' });
  } catch (error) {
    console.error('Error verifying OTP:', error);
    next(error);
  }
};

export const resetPassword = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { phoneNumber, newPassword } = req.body as { phoneNumber?: string; newPassword?: string };

  if (!phoneNumber || !newPassword) {
    res.status(400).json({ message: 'Phone number and new password are required' });
    return;
  }

  if (newPassword.length < 6) {
    res.status(400).json({ message: 'Password must be at least 6 characters long.' });
    return;
  }

  try {
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { phoneNumber },
      data: { password: hashedPassword },
    });

    res.status(200).json({ message: 'Password has been reset successfully.' });
  } catch (error) {
    console.error('Error resetting password:', error);
    next(error);
  }
};

export default { requestOTP, verifyOTP, resetPassword };