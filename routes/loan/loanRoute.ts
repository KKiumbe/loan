

import express from 'express';
import verifyToken from '../../middleware/verifyToken';
import checkAccess from '../../middleware/roleVerify';
import {  getAllLoansWithDetails, getCurrentMonthLoanStats, getLoansByOrganization, getLoansByStatus, getPendingLoanRequests, getPendingLoans, getUserLoans, } from '../../controller/loan/getloans';
import { createLoan } from '../../controller/loan/createloan';
import { approveLoan } from '../../controller/loan/aproveloans';
import { rejectLoan } from '../../controller/loan/rejectloans';



const router = express.Router();


// Create organization admin (Admin only)
router.post('/create-loan', verifyToken,  createLoan);

router.get('/user-loans', verifyToken, getUserLoans);
//get pending loan requests
router.get('/pending-loans', verifyToken,  getPendingLoanRequests);

//route for admins to fetch pending loand for aproval for mobile
router.get('/loans/pending', verifyToken,  getPendingLoans);

router.get('/loans/stats/current-month', verifyToken, getCurrentMonthLoanStats);


//router.get('/loans', verifyToken, getLoansGroupedByStatus);
router.get('/get-all-loans', verifyToken,  getAllLoansWithDetails);

//router.get('/get-loan:id', verifyToken, checkAccess('loan', 'read'), getLoanById);

router.patch('/approve-loan/:id', verifyToken, checkAccess('loan', 'approve'), approveLoan);

router.put('/reject-loan/:id', verifyToken, checkAccess('loan', 'reject'), rejectLoan);


router.get('/loans/organization/:organizationId', verifyToken, getLoansByOrganization);




router.get('/loans-by-status', verifyToken,  getLoansByStatus);

export default router;

