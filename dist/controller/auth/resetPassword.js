"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetPassword = exports.verifyOTP = exports.requestOTP = void 0;
const crypto_1 = __importDefault(require("crypto"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const client_1 = require("@prisma/client");
const sms_1 = require("../sms/sms"); // Adjust path
const prisma = new client_1.PrismaClient();
const requestOTP = async (req, res, next) => {
    const { phoneNumber } = req.body;
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
        const hashedOtp = crypto_1.default.createHash('sha256').update(otp).digest('hex');
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
        await (0, sms_1.sendSMS)(user.tenantId, phoneNumber, message);
        res.status(200).json({ message: 'If the phone number exists, an OTP has been sent.' });
    }
    catch (error) {
        console.error('Error requesting OTP:', error);
        next(error);
    }
};
exports.requestOTP = requestOTP;
const verifyOTP = async (req, res, next) => {
    const { phoneNumber, otp } = req.body;
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
        const hashedOtp = crypto_1.default.createHash('sha256').update(otp).digest('hex');
        const isOtpValid = hashedOtp === user.resetCode &&
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
    }
    catch (error) {
        console.error('Error verifying OTP:', error);
        next(error);
    }
};
exports.verifyOTP = verifyOTP;
const resetPassword = async (req, res, next) => {
    const { phoneNumber, newPassword } = req.body;
    if (!phoneNumber || !newPassword) {
        res.status(400).json({ message: 'Phone number and new password are required' });
        return;
    }
    if (newPassword.length < 6) {
        res.status(400).json({ message: 'Password must be at least 6 characters long.' });
        return;
    }
    try {
        const hashedPassword = await bcrypt_1.default.hash(newPassword, 10);
        await prisma.user.update({
            where: { phoneNumber },
            data: { password: hashedPassword },
        });
        res.status(200).json({ message: 'Password has been reset successfully.' });
    }
    catch (error) {
        console.error('Error resetting password:', error);
        next(error);
    }
};
exports.resetPassword = resetPassword;
exports.default = { requestOTP: exports.requestOTP, verifyOTP: exports.verifyOTP, resetPassword: exports.resetPassword };
