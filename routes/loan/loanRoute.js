

const express = require('express');
const verifyToken = require('../../middleware/verifyToken.js');
const { createLoan, getLoans, getLoanById, approveLoan } = require('../../controller/loan/loan.js');
const checkAccess = require('../../middleware/roleVerify.js');

const router = express.Router();


// Create organization admin (Admin only)
router.post('/create-loan', verifyToken, checkAccess('loan', 'create'), createLoan);
router.get('/get-loans', verifyToken, checkAccess('loan', 'read'), getLoans);
router.get('/get-loan:id', verifyToken, checkAccess('loan', 'read'), getLoanById);

router.patch('/approve-loan/:id', verifyToken, checkAccess('loan', 'approve'), approveLoan);


module.exports = router;

