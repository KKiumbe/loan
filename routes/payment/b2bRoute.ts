import express from 'express';
import verifyToken from '../../middleware/verifyToken';
import { getAccountBalance, getB2BTransactions, initiateB2BTransfer } from '../../controller/mpesa/b2bPayment';



const router = express.Router();


router.post('/b2b-transfer', verifyToken, initiateB2BTransfer);

router.post('/fetch-account-balance', verifyToken, getAccountBalance);

router.get('/b2b-transactions', verifyToken, getB2BTransactions);



export default router;