import express from 'express';
import verifyToken from '../../middleware/verifyToken';
import { initiateB2BTransfer } from '../../controller/mpesa/b2bPayment';



const router = express.Router();


router.get('/b2b-transfer', verifyToken, initiateB2BTransfer);


export default router;