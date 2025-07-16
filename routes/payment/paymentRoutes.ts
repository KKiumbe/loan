import express from 'express';
import verifyToken from '../../middleware/verifyToken';
import checkAccess from '../../middleware/roleVerify';
import { getAllLoanPayouts, getPaymentBatches, getPaymentConfirmations } from '../../controller/payments/getAllPayments';
//import createRepayment from '../../controller/loan/loanRepayment';


const router = express.Router();


router.get('/loan-payouts', verifyToken, getAllLoanPayouts);

//create organization payment 
//router.post('/create-payment', verifyToken, checkAccess('payment', 'create'), createRepayment);

router.get('/payment-confirmations', verifyToken,  getPaymentConfirmations );

router.get(
  '/payment-batches',
  verifyToken,
 
  getPaymentBatches
);

export default router;