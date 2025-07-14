// src/routes/userRoute.ts
import express, { Request, Response, NextFunction } from 'express';
import { register, signin } from '../../controller/auth/signupSignIn';
import { registerUser, createOrgAdmin } from '../../controller/users/users';
import { requestOTP, verifyOTP, resetPassword } from '../../controller/auth/resetPassword';
import  verifyToken, { AuthenticatedRequest } from '../../middleware/verifyToken';

const router = express.Router();

// Route: Signup (create a new user + tenant)
router.post('/signup', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await register(req, res);
  } catch (err) {
    next(err);
  }
});

// Route: Signin
router.post('/signin', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await signin(req, res);
  } catch (err) {
    next(err);
  }
});

// Route: Add user (protected)

router.post('/adduser', verifyToken, registerUser);



// Route: Create Org Admin (protected)
router.post('/create-org-admin', verifyToken, createOrgAdmin);

// OTP Routes
router.post('/request-otp', requestOTP);
router.post('/verify-otp', verifyOTP);
router.post('/reset-password', resetPassword);

export default router;