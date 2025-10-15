import express from 'express';
import verifyToken from '../../middleware/verifyToken';
import checkAccess from '../../middleware/roleVerify';
import { getAllC2BMpesaTransactions, getAllLoanPayouts, getPaymentBatches, getPaymentConfirmations, searchC2BMpesaTransactions } from '../../controller/payments/getAllPayments';
//import createRepayment from '../../controller/loan/loanRepayment';


const router = express.Router();


router.get('/loan-payouts', verifyToken, getAllLoanPayouts);

//create organization payment 
//router.post('/create-payment', verifyToken, checkAccess('payment', 'create'), createRepayment);

router.get('/payment-confirmations', verifyToken,  getPaymentConfirmations );

//getAllC2BMpesaTransactions

router.get('/c2b-transactions', verifyToken, getAllC2BMpesaTransactions);

router.get("/c2b-transactions/search",verifyToken, searchC2BMpesaTransactions);

router.get(
  '/payment-batches',
  verifyToken,
 
  getPaymentBatches
);

export default router;