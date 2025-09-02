import express from 'express';
import verifyToken from '../../middleware/verifyToken';
import createRepayment from '../../controller/loanRepayment/payment';


const router = express.Router();



router.post('/create-payment',verifyToken, createRepayment);


export default router;