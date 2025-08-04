"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/userRoute.ts
const express_1 = __importDefault(require("express"));
const signupSignIn_1 = require("../../controller/auth/signupSignIn");
const users_1 = require("../../controller/users/users");
const resetPassword_1 = require("../../controller/auth/resetPassword");
const verifyToken_1 = __importDefault(require("../../middleware/verifyToken"));
const router = express_1.default.Router();
// Route: Signup (create a new user + tenant)
router.post('/signup', async (req, res, next) => {
    try {
        await (0, signupSignIn_1.register)(req, res);
    }
    catch (err) {
        next(err);
    }
});
// Route: Signin
router.post('/signin', async (req, res, next) => {
    try {
        await (0, signupSignIn_1.signin)(req, res);
    }
    catch (err) {
        next(err);
    }
});
// Route: Add user (protected)
router.post('/adduser', verifyToken_1.default, users_1.registerUser);
// Route: Create Org Admin (protected)
router.post('/create-org-admin', verifyToken_1.default, users_1.createOrgAdmin);
// OTP Routes
router.post('/request-otp', resetPassword_1.requestOTP);
router.post('/verify-otp', resetPassword_1.verifyOTP);
router.post('/reset-password', resetPassword_1.resetPassword);
exports.default = router;
