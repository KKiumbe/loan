const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const { sendSMS } = require('../sms/sms'); // Adjust path as needed
const prisma = new PrismaClient();

const requestOTP = async (req, res) => {
  const { phoneNumber } = req.body;

  if (!phoneNumber) {
    return res.status(400).json({ message: 'Phone number is required' });
  }

  try {
    // Find the user by phone number, including tenant relation
    const user = await prisma.user.findUnique({
      where: { phoneNumber },
      include: { tenant: true }, // Include tenant to get tenantId
    });

    // Return generic message even if user not found (security best practice)
    if (!user) {
      return res.status(404).json({ message: 'If the phone number exists, an OTP has been sent.' });
    }

    // Generate a random 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Hash the OTP before saving it to the database
    const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');

    // Set OTP expiry time (e.g., 10 minutes)
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Save OTP and expiry time to the database
    await prisma.user.update({
      where: { phoneNumber },
      data: {
        resetCode: hashedOtp,
        resetCodeExpiresAt: otpExpiresAt,
        otpAttempts: 0,
      },
    });

    // Send the OTP to the user via SMS using tenantId from user
    const message = `Your one-time password (OTP) is: ${otp}`;
    await sendSMS(user.tenantId, phoneNumber, message);

    res.status(200).json({ message: 'If the phone number exists, an OTP has been sent.' });
  } catch (error) {
    console.error('Error requesting OTP:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
};

const verifyOTP = async (req, res) => {
  const { phoneNumber, otp } = req.body;

  if (!phoneNumber || !otp) {
    return res.status(400).json({ message: 'Phone number and OTP are required' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { phoneNumber } });

    if (!user || !user.resetCode) {
      return res.status(400).json({ message: 'Invalid or expired OTP.' });
    }

    if (user.otpAttempts >= 5) {
      return res.status(403).json({ message: 'Too many failed attempts. Please request a new OTP.' });
    }

    const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');
    const isOtpValid =
      hashedOtp === user.resetCode && user.resetCodeExpiresAt > new Date();

    if (!isOtpValid) {
      await prisma.user.update({
        where: { phoneNumber },
        data: { otpAttempts: user.otpAttempts + 1 },
      });
      return res.status(400).json({ message: 'Invalid or expired OTP.' });
    }

    // Clear OTP and reset OTP attempts
    await prisma.user.update({
      where: { phoneNumber },
      data: { resetCode: null, resetCodeExpiresAt: null, otpAttempts: 0 },
    });

    res.status(200).json({ message: 'OTP verified. You can now reset your password.' });
  } catch (error) {
    console.error('Error verifying OTP:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
};

const resetPassword = async (req, res) => {
  const { phoneNumber, newPassword } = req.body;

  if (!phoneNumber || !newPassword) {
    return res.status(400).json({ message: 'Phone number and new password are required' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters long.' });
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
    res.status(500).json({ message: 'Internal server error.' });
  }
};

module.exports = {
  requestOTP,
  verifyOTP,
  resetPassword,
};