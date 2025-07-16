import express from 'express';

import verifyToken from '../../middleware/verifyToken';
import  {getLatestBalance}  from '../../controller/sms/sms';
import checkAccess from '../../middleware/roleVerify';

const router = express.Router();


// Endpoint to fetch SMS balance
router.get('/get-sms-balance',verifyToken, getLatestBalance 
);
//done testing mult sms
export default router;
