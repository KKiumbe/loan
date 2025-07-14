import express from 'express';
const router = express.Router();
import { PrismaClient } from '@prisma/client';
import { getLatestBalance, handleAccountBalanceResult, handleAccountBalanceTimeout, handleB2CResult, handleB2CTimeout } from '../../controller/mpesa/results';
import checkAccess from '../../middleware/roleVerify';
import verifyToken from '../../middleware/verifyToken';

const prisma = new PrismaClient();




router.post('/b2c-result', handleB2CResult);
router.post('/b2c-timeout', handleB2CTimeout);

router.post('/accountbalance-result', handleAccountBalanceResult);
router.post('/accountbalance-timeout', handleAccountBalanceTimeout);
// Route to handle M-Pesa callback notifications


router.get('/latest-mpesa-balance',verifyToken, checkAccess('mpesa', 'read'),getLatestBalance);



// Route to handle Lipa Na M-Pesa requests


export default router;
