// routes/customerRoutes.js
const express = require('express');
const { register, signin } = require('../../controller/auth/signupSignIn.js');
const { registerUser, createOrgAdmin, getOrgAdmins, getOrgAdminDetails } = require('../../controller/users/users.js');
const authenticateAdmin = require('../../middleware/authenticateAdmin.js');
const { requestOTP, verifyOTP, resetPassword } = require('../../controller/auth/resetPassword.js');
const verifyToken = require('../../middleware/verifyToken.js');

// requestOTP,
//   verifyOTP,
//   resetPassword,

const router = express.Router();

// Route to create a new customer
router.post('/signup', register);
router.post('/signin', signin);
router.post('/adduser',verifyToken, registerUser)

router.post('/create-org-admin',verifyToken, createOrgAdmin)


router.post('/request-otp', requestOTP); // No auth required
router.post('/verify-otp', verifyOTP);   // No auth required
router.post('/reset-password', resetPassword);


module.exports = router;
